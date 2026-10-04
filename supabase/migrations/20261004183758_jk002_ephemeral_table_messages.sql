create table private.ephemeral_game_messages (
  id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  sender_seat smallint not null check(sender_seat between 0 and 3),
  target_seat smallint check(target_seat between 0 and 3 and target_seat <> sender_seat),
  message_text text not null check(char_length(message_text) between 1 and 80),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at = created_at + interval '5 seconds')
);
create index ephemeral_game_messages_live_idx on private.ephemeral_game_messages(game_id,expires_at);
alter table private.ephemeral_game_messages enable row level security;
revoke all on private.ephemeral_game_messages from public,anon,authenticated;
grant all on private.ephemeral_game_messages to service_role;

create or replace function private.cleanup_ephemeral_game_messages_internal()
returns void language sql security definer set search_path=pg_catalog,public,private as $$
  delete from private.ephemeral_game_messages m where m.expires_at <= clock_timestamp()
    or not exists(select 1 from public.games g where g.id=m.game_id and g.lifecycle in ('starting','active'));
$$;
revoke all on function private.cleanup_ephemeral_game_messages_internal() from public,anon,authenticated;
grant execute on function private.cleanup_ephemeral_game_messages_internal() to service_role;

create or replace function private.clear_completed_game_messages_internal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  delete from private.ephemeral_game_messages where game_id=new.id;
  return new;
end;
$$;
revoke all on function private.clear_completed_game_messages_internal() from public,anon,authenticated;
grant execute on function private.clear_completed_game_messages_internal() to service_role;
create trigger clear_completed_game_messages after update of lifecycle on public.games
for each row when (new.lifecycle='complete') execute function private.clear_completed_game_messages_internal();

create or replace function public.ephemeral_table_messages_internal(
  p_session_token text,p_game_id uuid,p_action text,
  p_message_id uuid default null,p_target_seat integer default null,p_text text default null
)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions as $$
declare v_player uuid; v_sender smallint; v_message private.ephemeral_game_messages%rowtype;
  v_now timestamptz; v_text text; v_messages jsonb;
begin
  select v.id into v_player from public.validate_player_session_internal(p_session_token) v limit 1;
  if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  select gp.seat_index into v_sender from public.game_participants gp join public.games g on g.id=gp.game_id
  where gp.game_id=p_game_id and gp.player_id=v_player and gp.owner_type='human'
    and gp.status='active' and g.lifecycle in ('starting','active');
  if v_sender is null then return jsonb_build_object('ok',false,'code','NOT_AUTHORIZED'); end if;
  if p_action not in ('send','list') or p_action is null then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  perform private.cleanup_ephemeral_game_messages_internal();
  if p_action='send' then
    v_text:=btrim(p_text);
    if p_message_id is null or v_text is null or char_length(v_text) not between 1 and 80 or v_text ~ '[[:cntrl:]]' then
      return jsonb_build_object('ok',false,'code','INVALID_MESSAGE');
    end if;
    if p_target_seat is not null and (p_target_seat=v_sender or p_target_seat not between 0 and 3
       or not exists(select 1 from public.game_participants where game_id=p_game_id and seat_index=p_target_seat and status='active')) then
      return jsonb_build_object('ok',false,'code','INVALID_TARGET');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_game_id::text||':messages:'||v_sender::text,0));
    select * into v_message from private.ephemeral_game_messages where id=p_message_id;
    if found then
      if v_message.game_id<>p_game_id or v_message.sender_seat<>v_sender
         or v_message.target_seat is distinct from p_target_seat or v_message.message_text<>v_text then
        return jsonb_build_object('ok',false,'code','MESSAGE_ID_CONFLICT');
      end if;
    else
      v_now:=clock_timestamp();
      if (select count(*) from private.ephemeral_game_messages where game_id=p_game_id and sender_seat=v_sender and expires_at>v_now)>=3 then
        return jsonb_build_object('ok',false,'code','RATE_LIMITED');
      end if;
      -- Completion races are rechecked before transport insertion. Completion's
      -- trigger clears all messages in the same transaction as finalization.
      perform 1 from public.games where id=p_game_id and lifecycle in ('starting','active') for share;
      if not found then return jsonb_build_object('ok',false,'code','NOT_AUTHORIZED'); end if;
      insert into private.ephemeral_game_messages(id,game_id,sender_seat,target_seat,message_text,created_at,expires_at)
      values(p_message_id,p_game_id,v_sender,p_target_seat,v_text,v_now,v_now+interval '5 seconds') returning * into v_message;
    end if;
  end if;
  v_now:=clock_timestamp();
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'fromSeat',m.sender_seat,'to',coalesce(to_jsonb(m.target_seat),'"all"'::jsonb),
    'text',m.message_text,'createdAt',m.created_at,'expiresAt',m.expires_at) order by m.created_at,m.id),'[]'::jsonb)
  into v_messages from private.ephemeral_game_messages m where m.game_id=p_game_id and m.expires_at>v_now;
  return jsonb_build_object('ok',true,'serverNow',v_now,'messages',v_messages);
end;
$$;
revoke all on function public.ephemeral_table_messages_internal(text,uuid,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.ephemeral_table_messages_internal(text,uuid,text,uuid,integer,text) to service_role;
select cron.schedule('jk002-message-cleanup','* * * * *','select private.cleanup_ephemeral_game_messages_internal();');
