-- BIRIBA Black Box: isolated, disposable diagnostic data. No game-state changes.
create table if not exists public.biriba_debug_settings (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default true,
 retention_days integer not null default 7 check (retention_days between 1 and 30),
 last_cleanup_at timestamptz not null default now()
);
insert into public.biriba_debug_settings(singleton) values(true) on conflict do nothing;

create table if not exists public.biriba_debug_events (
 id bigint generated always as identity primary key,
 room_id uuid not null,
 player_id uuid not null,
 session_key uuid not null,
 happened_at timestamptz not null default now(),
 kind text not null check (length(kind) between 1 and 64),
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists biriba_debug_room_idx on public.biriba_debug_events(room_id, id);
create index if not exists biriba_debug_player_idx on public.biriba_debug_events(player_id, created_at desc);
create index if not exists biriba_debug_expiry_idx on public.biriba_debug_events(created_at);
alter table public.biriba_debug_events enable row level security;
alter table public.biriba_debug_settings enable row level security;
revoke all on public.biriba_debug_events, public.biriba_debug_settings from anon, authenticated, public;
revoke all on sequence public.biriba_debug_events_id_seq from anon, authenticated, public;

-- Only the service-role Edge Function can call this RPC; it still authenticates
-- the Joker session and verifies actual membership/admin player ID.
create or replace function public.biriba_debug_internal(
 p_session_token text, p_action text, p_code text default null,
 p_room_id uuid default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public','private','extensions'
as $$
declare
 v_player uuid;
 v_room uuid;
 v_enabled boolean;
 v_retention integer;
 v_is_admin boolean;
 v_session uuid;
 v_events jsonb;
 v_entry jsonb;
 v_total integer;
 v_recent timestamptz;
begin
 select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
 if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
 v_is_admin := v_player = 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid;
 select enabled, retention_days, last_cleanup_at into v_enabled,v_retention,v_recent
 from public.biriba_debug_settings where singleton=true;
 if v_recent < now() - interval '1 hour' then
   delete from public.biriba_debug_events where created_at < now() - (v_retention || ' days')::interval;
   update public.biriba_debug_settings set last_cleanup_at=now() where singleton=true;
 end if;
 if p_action='status' then
   return jsonb_build_object('ok',true,'enabled',v_enabled,'isAdmin',v_is_admin);
 end if;
 if p_action='ingest' then
   if not v_enabled then return jsonb_build_object('ok',true,'accepted',0); end if;
   if p_code is null or p_code !~ '^[A-Z0-9]{6}$' then
     return jsonb_build_object('ok',false,'code','INVALID_CODE');
   end if;
   select r.id into v_room from public.biriba_rooms r
     join public.biriba_room_seats s on s.room_id=r.id
     where r.code=p_code and s.player_id=v_player and s.occupant_type='human' limit 1;
   if v_room is null then return jsonb_build_object('ok',false,'code','NOT_MEMBER'); end if;
   if jsonb_typeof(p_payload->'sessionKey') <> 'string'
     or (p_payload->>'sessionKey') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_payload->'events') <> 'array' then
       return jsonb_build_object('ok',false,'code','INVALID_EVENTS');
   end if;
   v_events:=p_payload->'events';
   v_total:=jsonb_array_length(v_events);
   if v_total > 40 or length(v_events::text)>20000 then
     return jsonb_build_object('ok',false,'code','LIMIT_EXCEEDED');
   end if;
   select count(*) into v_total from public.biriba_debug_events
     where room_id=v_room and player_id=v_player;
   if v_total>=2500 then return jsonb_build_object('ok',true,'accepted',0,'limit',true); end if;
   v_session := (p_payload->>'sessionKey')::uuid;
   for v_entry in select value from jsonb_array_elements(v_events) loop
     if jsonb_typeof(v_entry) <> 'object'
       or length(v_entry::text)>1400
       or jsonb_typeof(v_entry->'kind') <> 'string'
       or length(v_entry->>'kind') not between 1 and 64 then
       continue;
     end if;
     insert into public.biriba_debug_events(room_id,player_id,session_key,kind,details)
       values(v_room,v_player,v_session,left(v_entry->>'kind',64),
       jsonb_build_object('t',v_entry->'t','data',coalesce(v_entry->'data','{}'::jsonb)));
   end loop;
   return jsonb_build_object('ok',true,'accepted',(select count(*) from public.biriba_debug_events
     where room_id=v_room and player_id=v_player and session_key=v_session));
 end if;
 if not v_is_admin then return jsonb_build_object('ok',false,'code','ADMIN_ONLY'); end if;
 if p_action='list' then
   return jsonb_build_object('ok',true,'matches',coalesce((
     select jsonb_agg(to_jsonb(q) order by q.last_event desc) from (
       select e.room_id as "roomId",r.code as "code", max(e.created_at) as last_event,
         min(e.created_at) as first_event, count(*) as "eventCount",
         count(distinct e.player_id) as "playerCount",
         count(distinct e.session_key) as "deviceCount",
         count(*) filter(where e.kind in ('error','warning','long_task','slow_action','animation_timeout')) as "warningCount",
         jsonb_agg(distinct p.display_name) as players
       from public.biriba_debug_events e
       left join public.biriba_rooms r on r.id=e.room_id
       join public.players p on p.id=e.player_id
       group by e.room_id,r.code order by max(e.created_at) desc limit 100
     ) q), '[]'::jsonb));
 end if;
 if p_action='export' then
   if p_room_id is null then return jsonb_build_object('ok',false,'code','MISSING_ROOM'); end if;
   return jsonb_build_object('ok',true,'events',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',e.id,'player',p.display_name,'playerId',e.player_id,
       'sessionKey',e.session_key,'at',e.created_at,'kind',e.kind,'details',e.details
     ) order by e.id)
     from public.biriba_debug_events e join public.players p on p.id=e.player_id
     where e.room_id=p_room_id
     ), '[]'::jsonb));
 end if;
 if p_action='purge' then
   if p_payload->>'confirm' <> 'DELETE_BIRIBA_DIAGNOSTICS' then
     return jsonb_build_object('ok',false,'code','CONFIRM_REQUIRED');
   end if;
   if p_room_id is null then
     delete from public.biriba_debug_events;
   else
     delete from public.biriba_debug_events where room_id=p_room_id;
   end if;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='toggle' then
   if jsonb_typeof(p_payload->'enabled') <> 'boolean'
     then return jsonb_build_object('ok',false,'code','INVALID_FLAG'); end if;
   update public.biriba_debug_settings set enabled=(p_payload->>'enabled')::boolean where singleton=true;
   return jsonb_build_object('ok',true,'enabled',(p_payload->>'enabled')::boolean);
 end if;
 return jsonb_build_object('ok',false,'code','INVALID_ACTION');
end $$;
revoke all on function public.biriba_debug_internal(text,text,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.biriba_debug_internal(text,text,text,uuid,jsonb) to service_role;

-- Removal (ONLY with separate explicit approval, after disabling capture):
-- drop function if exists public.biriba_debug_internal(text,text,text,uuid,jsonb);
-- drop table if exists public.biriba_debug_events;
-- drop table if exists public.biriba_debug_settings;
