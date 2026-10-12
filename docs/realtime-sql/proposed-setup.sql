-- REVIEW CANDIDATE ONLY. Not in migrations; never applied by this task.
-- After confirmed staging review, generate a migration with supabase migration new.
-- Requires current owner schema + approved trusted signing key + private-only Realtime settings.
begin;
-- Fail closed on unreviewed policy interactions or canonical table exposure.
do $$
begin
  if not (select relrowsecurity from pg_class where oid='realtime.messages'::regclass) then
    raise exception 'Realtime RLS must already be enabled by Supabase';
  end if;
  if exists (select 1 from pg_policies where schemaname='realtime' and tablename='messages') then
    raise exception 'Review existing permissive/restrictive Realtime policies before applying this candidate';
  end if;
  if has_table_privilege('authenticated','public.games','SELECT') or has_table_privilege('anon','public.games','SELECT') then
    raise exception 'Canonical games exposure must be resolved before issuing participant JWTs';
  end if;
end $$;

create table private.joker_realtime_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  jwt_issuer text not null default ''
);
insert into private.joker_realtime_config values (true,false,'');
revoke all on private.joker_realtime_config from public,anon,authenticated;
grant select,update on private.joker_realtime_config to service_role;

-- Service-only, session-derived identity; no caller-selected player/session/topic.
create function public.authorize_joker_realtime_internal(p_session_token text,p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_identity jsonb;
begin
  if not exists(select 1 from private.joker_realtime_config where enabled and jwt_issuer<>'') then return null; end if;
  if p_session_token !~ '^[0-9a-fA-F]{64}$' then return null; end if;
  select jsonb_build_object('playerId',s.player_id,'sessionId',s.id,'expiresAt',s.expires_at)
    into v_identity
    from private.player_sessions s
    join public.players p on p.id=s.player_id and p.is_active
    join public.game_participants gp on gp.player_id=s.player_id and gp.owner_type='human' and gp.status='active'
    join public.games g on g.id=gp.game_id and g.lifecycle in ('starting','active')
    where g.id=p_game_id and s.token_hash=pg_catalog.sha256(pg_catalog.convert_to(p_session_token,'UTF8'))
      and s.active_control and s.revoked_at is null and s.expires_at>clock_timestamp();
  return v_identity;
end $$;
revoke all on function public.authorize_joker_realtime_internal(text,uuid) from public,anon,authenticated;
grant execute on function public.authorize_joker_realtime_internal(text,uuid) to service_role;

-- Narrow boolean only. SECURITY DEFINER is needed because sessions/membership are private.
-- Explicit signed subject/scope checks; no rows, hashes or canonical values returned.
create function public.joker_realtime_receive_authorized(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := auth.jwt();
begin
  if not exists (select 1 from private.joker_realtime_config where enabled and jwt_issuer=c->>'iss') then return false; end if;
  if c->>'jkr_scope' is distinct from 'receive' or auth.uid() is null or
     c->>'jkr_topic' is distinct from p_topic or realtime.topic() is distinct from p_topic or
     c->>'role' is distinct from 'authenticated' or c->>'aud' is distinct from 'authenticated' or
     c->>'exp' is null or c->>'iat' is null or
     (c->>'exp')::numeric - (c->>'iat')::numeric > 90 or
     (c->>'iat')::numeric > extract(epoch from statement_timestamp()) + 5 or
     (c->>'exp')::numeric <= extract(epoch from statement_timestamp()) then return false; end if;
  if p_topic is distinct from 'joker:v1:'||(c->>'jkr_game_id')||':'||(c->>'jkr_session_id') then return false; end if;
  return exists (
    select 1 from private.player_sessions s
    join public.players p on p.id=s.player_id and p.is_active
    join public.game_participants gp on gp.player_id=s.player_id and gp.owner_type='human'
    join public.games g on g.id=gp.game_id
    where s.id=(c->>'jkr_session_id')::uuid and s.player_id=auth.uid() and gp.game_id=(c->>'jkr_game_id')::uuid
      and s.active_control and s.revoked_at is null and s.expires_at>statement_timestamp()
      and (gp.status='active' and g.lifecycle in ('starting','active') or gp.status='completed' and g.lifecycle='complete')
  );
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function public.joker_realtime_receive_authorized(text) from public,anon;
grant execute on function public.joker_realtime_receive_authorized(text) to authenticated;

create policy joker_receive on realtime.messages for select to authenticated
using (extension='broadcast' and public.joker_realtime_receive_authorized(topic));
-- Restrictive guard protects capability tokens even if another permissive policy is later added.
create policy joker_receive_guard on realtime.messages as restrictive for select to authenticated
using ((auth.jwt()->>'jkr_scope') is distinct from 'receive' or
       extension='broadcast' and public.joker_realtime_receive_authorized(topic));
create policy joker_no_send on realtime.messages as restrictive for insert to authenticated
with check ((auth.jwt()->>'jkr_scope') is distinct from 'receive');
create policy joker_no_update on realtime.messages as restrictive for update to authenticated
using ((auth.jwt()->>'jkr_scope') is distinct from 'receive')
with check ((auth.jwt()->>'jkr_scope') is distinct from 'receive');
create policy joker_no_delete on realtime.messages as restrictive for delete to authenticated
using ((auth.jwt()->>'jkr_scope') is distinct from 'receive');

-- Sanitized transactional emission covers human CAS, worker/bot CAS and finalization.
-- Per-current-session topics: cached old sockets get no future emissions after revocation.
create function private.emit_joker_invalidation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient record; payload jsonb;
begin
  if not exists(select 1 from private.joker_realtime_config where enabled) then return new; end if;
  if tg_op='UPDATE' and new.state_version<=old.state_version and new.lifecycle=old.lifecycle then return new; end if;
  payload := jsonb_build_object('protocol',1,'gameId',new.id,'stateVersion',new.state_version,
    'kind',case when new.lifecycle='complete' then 'game_closed' else 'state_changed' end,
    'emittedAt',clock_timestamp());
  for recipient in
    select distinct s.id from private.player_sessions s
    join public.players p on p.id=s.player_id and p.is_active
    join public.game_participants gp on gp.player_id=s.player_id and gp.owner_type='human'
    where gp.game_id=new.id and (gp.status='active' or new.lifecycle='complete' and gp.status='completed')
      and s.active_control and s.revoked_at is null and s.expires_at>clock_timestamp()
  loop
    begin
      perform realtime.send(payload,'joker_state_changed','joker:v1:'||new.id::text||':'||recipient.id::text,true);
    exception when others then
      -- Notification failure must not reject a legal game move. Polling recovers.
      raise warning 'joker invalidation unavailable (SQLSTATE %)',sqlstate;
    end;
  end loop;
  return new;
end $$;
revoke all on function private.emit_joker_invalidation() from public,anon,authenticated;
create trigger joker_state_invalidation after insert or update of state_version,lifecycle
on public.games for each row execute function private.emit_joker_invalidation();
-- Host end updates games BEFORE revoking sessions; terminal wake-up is queued in that
-- same transaction. Rolled-back state updates roll back successful realtime.send inserts.
commit;
