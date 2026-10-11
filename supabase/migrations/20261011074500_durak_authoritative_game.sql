-- DURAK server-owned match state; private hands never granted to browser roles.
create table if not exists public.durak_match_states (
 room_id uuid primary key references public.durak_rooms(id) on delete cascade,
 revision bigint not null default 1 check (revision >= 1),
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.durak_match_states enable row level security;
revoke all on public.durak_match_states from public, anon, authenticated;
grant select,insert,update,delete on public.durak_match_states to service_role;

create or replace function public.durak_match_command_internal(
 p_session_token text, p_room_code text, p_action text,
 p_expected_revision bigint default null, p_state jsonb default null, p_seat integer default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions as $$
declare
 v_player uuid;
 v_room public.durak_rooms%rowtype;
 v_member integer;
 v_match public.durak_match_states%rowtype;
 v_bot_index integer;
 v_bot_number integer;
 v_humans integer;
begin
 select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
 if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
 select * into v_room from public.durak_rooms where code=upper(trim(p_room_code)) for update;
 if not found then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND'); end if;
 select seat_index into v_member from public.durak_room_seats where room_id=v_room.id and player_id=v_player and occupant_type='human';
 if v_member is null then return jsonb_build_object('ok',false,'code','NOT_A_MEMBER'); end if;
 if p_action='load' then
   if v_room.lifecycle not in ('playing','finished') then return jsonb_build_object('ok',false,'code','NOT_STARTED'); end if;
   select * into v_match from public.durak_match_states where room_id=v_room.id;
   if not found then return jsonb_build_object('ok',false,'code','STATE_UNAVAILABLE'); end if;
   return jsonb_build_object('ok',true,'state',v_match.state,'revision',v_match.revision,
     'seat',v_member,'roomLifecycle',v_room.lifecycle);
 elsif p_action in ('bot_add','bot_remove') then
   if v_room.lifecycle<>'waiting' or v_room.host_player_id<>v_player then
     return jsonb_build_object('ok',false,'code','HOST_ONLY'); end if;
   if p_action='bot_add' then
     select seat_index into v_bot_index from public.durak_room_seats
       where room_id=v_room.id and occupant_type='empty' order by seat_index limit 1;
     if v_bot_index is null then return jsonb_build_object('ok',false,'code','ROOM_FULL'); end if;
     select count(*)+1 into v_bot_number from public.durak_room_seats where room_id=v_room.id and occupant_type='bot';
     update public.durak_room_seats set occupant_type='bot',
       bot_id='durak-bot-'||v_bot_index,bot_display_name='Bot '||v_bot_number
       where room_id=v_room.id and seat_index=v_bot_index;
   else
     if p_seat is null or not exists(select 1 from public.durak_room_seats
       where room_id=v_room.id and seat_index=p_seat and occupant_type='bot') then
       return jsonb_build_object('ok',false,'code','INVALID_BOT'); end if;
     update public.durak_room_seats set occupant_type='empty',bot_id=null,bot_display_name=null
       where room_id=v_room.id and seat_index=p_seat;
   end if;
   update public.durak_rooms set version=version+1,updated_at=now() where id=v_room.id;
   return jsonb_build_object('ok',true,'updated',true);
 elsif p_action='start' then
   if v_room.lifecycle<>'waiting' or v_room.host_player_id<>v_player then
     return jsonb_build_object('ok',false,'code','HOST_ONLY'); end if;
   if (select count(*) from public.durak_room_seats where room_id=v_room.id and occupant_type='empty')<>0 then
     return jsonb_build_object('ok',false,'code','ROOM_NOT_FULL'); end if;
   if jsonb_typeof(p_state)<>'object' or (p_state->>'variant') is distinct from v_room.variant
     or jsonb_array_length(p_state->'hands') <> v_room.capacity
     or (p_state->>'ended') is distinct from 'false' then
     return jsonb_build_object('ok',false,'code','INVALID_STATE'); end if;
   insert into public.durak_match_states(room_id,state) values(v_room.id,p_state);
   update public.durak_rooms set lifecycle='playing',version=version+1,updated_at=now() where id=v_room.id;
   return jsonb_build_object('ok',true,'started',true);
 elsif p_action='save' then
   if v_room.lifecycle<>'playing' or p_expected_revision is null
     or jsonb_typeof(p_state)<>'object' then
     return jsonb_build_object('ok',false,'code','INVALID_STATE'); end if;
   update public.durak_match_states set state=p_state,revision=revision+1,updated_at=now()
     where room_id=v_room.id and revision=p_expected_revision returning * into v_match;
   if not found then return jsonb_build_object('ok',false,'code','STATE_CHANGED'); end if;
   if p_state->>'ended'='true' then
     update public.durak_rooms set lifecycle='finished',version=version+1,updated_at=now() where id=v_room.id;
   end if;
   return jsonb_build_object('ok',true,'revision',v_match.revision);
 end if;
 return jsonb_build_object('ok',false,'code','INVALID_ACTION');
end;
$$;
revoke all on function public.durak_match_command_internal(text,text,text,bigint,jsonb,integer) from public,anon,authenticated;
grant execute on function public.durak_match_command_internal(text,text,text,bigint,jsonb,integer) to service_role;
