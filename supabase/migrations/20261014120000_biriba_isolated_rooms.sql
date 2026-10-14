-- BIRIBA: independent, restricted server-owned rooms, seats and serialized match snapshots.
-- The canonical JOKER and DURAK state tables are never reused.
create table if not exists public.biriba_rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
 host_player_id uuid not null references public.players(id),
 capacity smallint not null check (capacity in (2,4)),
 target_score integer not null check (target_score in (1000,2000,5000,10000)),
 timer_enabled boolean not null default true,
 lifecycle text not null default 'waiting' check (lifecycle in ('waiting','playing','finished','cancelled')),
 version bigint not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.biriba_room_seats (
 room_id uuid not null references public.biriba_rooms(id) on delete cascade,
 seat_index smallint not null check (seat_index between 0 and 3),
 occupant_type text not null check (occupant_type in ('human','bot','empty')) default 'empty',
 player_id uuid references public.players(id),
 bot_id text, bot_display_name text, bot_tier smallint check (bot_tier between 1 and 3),
 primary key(room_id,seat_index),
 constraint biriba_occupants_valid check(
  (occupant_type='empty' and player_id is null and bot_id is null and bot_display_name is null and bot_tier is null)
  or (occupant_type='human' and player_id is not null and bot_id is null and bot_display_name is null and bot_tier is null)
  or (occupant_type='bot' and player_id is null and bot_id is not null and bot_display_name is not null and bot_tier is not null)
 )
);
create unique index if not exists biriba_human_room on public.biriba_room_seats(room_id,player_id) where player_id is not null;
create unique index if not exists biriba_bot_room on public.biriba_room_seats(room_id,bot_id) where bot_id is not null;
create index if not exists biriba_waiting on public.biriba_rooms(created_at desc) where lifecycle='waiting';
create index if not exists biriba_players on public.biriba_room_seats(player_id) where player_id is not null;
create table if not exists public.biriba_match_states (
 room_id uuid primary key references public.biriba_rooms(id) on delete cascade,
 revision bigint not null default 1 check(revision>0),
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.biriba_rooms enable row level security;
alter table public.biriba_room_seats enable row level security;
alter table public.biriba_match_states enable row level security;
revoke all on public.biriba_rooms,public.biriba_room_seats,public.biriba_match_states from public,anon,authenticated;
grant select,insert,update,delete on public.biriba_rooms,public.biriba_room_seats,public.biriba_match_states to service_role;

-- Every operation is authenticated from the server session token.
-- Creates and joins use the same advisory-lock namespace as JOKER/DURAK.
create or replace function public.biriba_room_command_internal(
 p_session_token text, p_action text,p_code text default null,
 p_capacity integer default null,p_target integer default null,p_timer_enabled boolean default null,
 p_seat integer default null,p_bot_id text default null,p_catalog jsonb default null,
 p_state jsonb default null,p_revision bigint default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,extensions as $$
declare
 v_player uuid;v_room public.biriba_rooms%rowtype;v_member integer;
 v_target integer;v_code text;v_attempt integer;v_bot jsonb;v_result jsonb;
 v_match public.biriba_match_states%rowtype;
begin
 select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
 if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED');end if;
 if p_action not in ('create','join','list','get','membership','leave','bot_add','bot_remove','start','load','save','end_game') then
   return jsonb_build_object('ok',false,'code','INVALID_ACTION');
 end if;
 if p_action in ('create','join') then
  perform pg_advisory_xact_lock(hashtextextended(v_player::text,20261009));
  if exists(select 1 from public.biriba_room_seats s join public.biriba_rooms r on r.id=s.room_id
      where s.player_id=v_player and s.occupant_type='human' and r.lifecycle in ('waiting','playing'))
   or exists(select 1 from public.durak_room_seats s join public.durak_rooms r on r.id=s.room_id
      where s.player_id=v_player and s.occupant_type='human' and r.lifecycle in ('waiting','playing'))
   or exists(select 1 from public.room_seats s join public.rooms r on r.id=s.room_id
      where s.player_id=v_player and s.occupant_type='human' and r.status='lobby')
   or exists(select 1 from public.game_participants gp join public.games g on gp.game_id=g.id
      where gp.player_id=v_player and gp.owner_type='human' and gp.status='active')
  then return jsonb_build_object('ok',false,'code','ACTIVE_GAME_EXISTS');end if;
 end if;
 if p_action='membership' then
  select r.* into v_room from public.biriba_rooms r join public.biriba_room_seats s on s.room_id=r.id
   where s.player_id=v_player and s.occupant_type='human' and r.lifecycle in ('waiting','playing')
   order by r.created_at desc limit 1;
  return jsonb_build_object('ok',true,'membership',case when found then jsonb_build_object('code',v_room.code,'lifecycle',v_room.lifecycle) else null end);
 end if;
 if p_action='list' then
  return jsonb_build_object('ok',true,'rooms',coalesce((
   select jsonb_agg(x.info order by x.created_at desc) from (
    select r.created_at,jsonb_build_object('code',r.code,'capacity',r.capacity,'target',r.target_score,'timerEnabled',r.timer_enabled,
      'hostName',p.display_name,'occupied',(select count(*) from public.biriba_room_seats s where s.room_id=r.id and s.occupant_type<>'empty')) info
    from public.biriba_rooms r join public.players p on p.id=r.host_player_id
    where r.lifecycle='waiting' and exists(select 1 from public.biriba_room_seats s where s.room_id=r.id and s.occupant_type='empty')
   ) x),'[]'::jsonb));
 end if;
 if p_action='create' then
  if p_capacity not in(2,4) or p_target not in (1000,2000,5000,10000) then
    return jsonb_build_object('ok',false,'code','INVALID_OPTIONS');end if;
  for v_attempt in 1..12 loop
   v_code:=upper(substr(encode(gen_random_bytes(8),'hex'),1,6));
   begin
    insert into public.biriba_rooms(code,host_player_id,capacity,target_score,timer_enabled)
      values(v_code,v_player,p_capacity,p_target,coalesce(p_timer_enabled,true)) returning * into v_room;
    exit;
   exception when unique_violation then
    if v_attempt=12 then return jsonb_build_object('ok',false,'code','SERVICE_UNAVAILABLE');end if;
   end;
  end loop;
  for v_target in 0..(p_capacity-1) loop
    insert into public.biriba_room_seats(room_id,seat_index,occupant_type,player_id)
    values(v_room.id,v_target,case when v_target=0 then 'human' else 'empty' end,
      case when v_target=0 then v_player else null end);
  end loop;
 else
  select * into v_room from public.biriba_rooms where code=upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND');end if;
  select seat_index into v_member from public.biriba_room_seats where room_id=v_room.id and player_id=v_player and occupant_type='human';
  if p_action='join' then
   if v_room.lifecycle<>'waiting' then return jsonb_build_object('ok',false,'code','ROOM_ALREADY_STARTED');end if;
   select seat_index into v_target from public.biriba_room_seats where room_id=v_room.id and occupant_type='empty'
      order by seat_index for update skip locked limit 1;
   if v_target is null then return jsonb_build_object('ok',false,'code','ROOM_FULL');end if;
   update public.biriba_room_seats set occupant_type='human',player_id=v_player
    where room_id=v_room.id and seat_index=v_target;
   update public.biriba_rooms set version=version+1,updated_at=now() where id=v_room.id;
  elsif v_member is null then
   return jsonb_build_object('ok',false,'code','NOT_A_MEMBER');
  elsif p_action='leave' then
   if v_room.lifecycle<>'waiting' then return jsonb_build_object('ok',false,'code','ROOM_ALREADY_STARTED');end if;
   if v_room.host_player_id=v_player then
    delete from public.biriba_rooms where id=v_room.id;
    return jsonb_build_object('ok',true,'cancelled',true);
   end if;
   update public.biriba_room_seats set occupant_type='empty',player_id=null
    where room_id=v_room.id and seat_index=v_member;
   update public.biriba_rooms set version=version+1,updated_at=now() where id=v_room.id;
   return jsonb_build_object('ok',true,'cancelled',true);
  elsif p_action in ('bot_add','bot_remove','start','end_game') then
   if v_room.host_player_id<>v_player then return jsonb_build_object('ok',false,'code','HOST_ONLY');end if;
   if p_action='end_game' then
    update public.biriba_rooms set lifecycle='finished',version=version+1,updated_at=now() where id=v_room.id;
    return jsonb_build_object('ok',true,'cancelled',true);
   end if;
   if v_room.lifecycle<>'waiting' then return jsonb_build_object('ok',false,'code','ROOM_ALREADY_STARTED');end if;
   if p_action='bot_remove' then
    update public.biriba_room_seats set occupant_type='empty',bot_id=null,bot_display_name=null,bot_tier=null
      where room_id=v_room.id and seat_index=p_seat and occupant_type='bot';
    if not found then return jsonb_build_object('ok',false,'code','INVALID_BOT');end if;
   else
    if jsonb_typeof(p_catalog) is distinct from 'array' then return jsonb_build_object('ok',false,'code','INVALID_BOT');end if;
    if p_action='bot_add' then
     v_target:=p_seat;
     if v_target is null then select seat_index into v_target from public.biriba_room_seats where room_id=v_room.id and occupant_type='empty' order by seat_index limit 1;end if;
     if not exists(select 1 from public.biriba_room_seats where room_id=v_room.id and seat_index=v_target and occupant_type in('empty','bot'))
      then return jsonb_build_object('ok',false,'code','INVALID_BOT');end if;
     select bot into v_bot from jsonb_array_elements(p_catalog) bot where (p_bot_id is null or bot->>'id'=p_bot_id)
      and not exists(select 1 from public.biriba_room_seats s where s.room_id=v_room.id and s.seat_index<>v_target and s.bot_id=bot->>'id') limit 1;
     if v_bot is null then return jsonb_build_object('ok',false,'code','BOT_UNAVAILABLE');end if;
     update public.biriba_room_seats set occupant_type='bot',player_id=null,
        bot_id=v_bot->>'id',bot_display_name=v_bot->>'displayName',bot_tier=(v_bot->>'tier')::smallint
      where room_id=v_room.id and seat_index=v_target;
    else
     for v_target in select seat_index from public.biriba_room_seats where room_id=v_room.id and occupant_type='empty' order by seat_index loop
      select bot into v_bot from jsonb_array_elements(p_catalog) bot
       where not exists(select 1 from public.biriba_room_seats s where s.room_id=v_room.id and s.bot_id=bot->>'id') limit 1;
      if v_bot is null then raise exception 'BIRIBA_BOT_CATALOG_EXHAUSTED';end if;
      update public.biriba_room_seats set occupant_type='bot',player_id=null,
        bot_id=v_bot->>'id',bot_display_name=v_bot->>'displayName',bot_tier=(v_bot->>'tier')::smallint
       where room_id=v_room.id and seat_index=v_target;
     end loop;
     if jsonb_typeof(p_state) is distinct from 'object' or jsonb_array_length(p_state->'hands')<>v_room.capacity
      or (p_state->>'seats')::integer<>v_room.capacity then return jsonb_build_object('ok',false,'code','INVALID_STATE');end if;
     insert into public.biriba_match_states(room_id,state)values(v_room.id,p_state);
     update public.biriba_rooms set lifecycle='playing',version=version+1,updated_at=now() where id=v_room.id;
     return jsonb_build_object('ok',true,'started',true);
    end if;
   end if;
   update public.biriba_rooms set version=version+1,updated_at=now() where id=v_room.id;
   return jsonb_build_object('ok',true,'updated',true);
  elsif p_action in ('load','save') then
   if v_room.lifecycle not in ('playing','finished') then return jsonb_build_object('ok',false,'code','NOT_STARTED');end if;
   select * into v_match from public.biriba_match_states where room_id=v_room.id;
   if not found then return jsonb_build_object('ok',false,'code','STATE_UNAVAILABLE');end if;
   if p_action='load' then return jsonb_build_object('ok',true,'state',v_match.state,'revision',v_match.revision,'seat',v_member);end if;
   if v_room.lifecycle<>'playing' or p_revision is null or jsonb_typeof(p_state) is distinct from 'object' then
    return jsonb_build_object('ok',false,'code','INVALID_STATE');end if;
   update public.biriba_match_states set state=p_state,revision=revision+1,updated_at=now()
     where room_id=v_room.id and revision=p_revision returning * into v_match;
   if not found then return jsonb_build_object('ok',false,'code','STATE_CHANGED');end if;
   if p_state->>'matchFinished'='true' then
    update public.biriba_rooms set lifecycle='finished',version=version+1,updated_at=now() where id=v_room.id;
   end if;
   return jsonb_build_object('ok',true,'revision',v_match.revision);
  end if;
 end if;
 select * into v_room from public.biriba_rooms where id=v_room.id;
 return jsonb_build_object('ok',true,'room',jsonb_build_object(
  'code',v_room.code,'capacity',v_room.capacity,'target',v_room.target_score,'timerEnabled',v_room.timer_enabled,
  'lifecycle',v_room.lifecycle,'version',v_room.version,'hostPlayerId',v_room.host_player_id,
  'seats',(select coalesce(jsonb_agg(jsonb_build_object('index',s.seat_index,'occupant',s.occupant_type,
   'name',coalesce(p.display_name,s.bot_display_name),'botId',s.bot_id,'tier',s.bot_tier) order by s.seat_index),'[]'::jsonb)
   from public.biriba_room_seats s left join public.players p on p.id=s.player_id where s.room_id=v_room.id)
 ));
end;
$$;
revoke all on function public.biriba_room_command_internal(text,text,text,integer,integer,boolean,integer,text,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.biriba_room_command_internal(text,text,text,integer,integer,integer,text,jsonb,jsonb,bigint) to service_role;
