-- Fix false ACTIVE_GAME_EXISTS caused by historical JOKER room_seats where
-- rooms.status='playing' but no active game participant exists anymore.
-- Count lobby seats as reservations, active game participants as ongoing games.
-- Same player advisory lock namespace is preserved for race safety.
-- DURAK-only transactional lobby RPCs. Invoked ONLY by trusted server service_role
-- after passing a private player session token; never directly exposed to clients.
create or replace function public.durak_room_command_internal(
  p_session_token text, p_action text, p_code text default null,
  p_variant text default null, p_capacity integer default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions as $$
declare
  v_player uuid;
  v_room public.durak_rooms%rowtype;
  v_code text;
  v_seat smallint;
  v_count integer;
begin
  select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
  if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  if p_action not in ('create','join','leave','get','list','membership') then
    return jsonb_build_object('ok',false,'code','INVALID_ACTION');
  end if;
  if p_action in ('create','join') then
    -- One participant cannot race two room creations/joins.
    perform pg_advisory_xact_lock(hashtextextended(v_player::text, 20261009));
    if exists (
      select 1 from public.durak_room_seats s join public.durak_rooms r on r.id=s.room_id
      where s.player_id=v_player and s.occupant_type='human' and r.lifecycle in ('waiting','playing')
    ) or exists (
      select 1 from public.room_seats s join public.rooms r on r.id=s.room_id
      where s.player_id=v_player and s.occupant_type='human' and r.status='lobby'
    ) or exists (
      select 1 from public.game_participants gp join public.games g on g.id=gp.game_id
      where gp.player_id=v_player and gp.owner_type='human' and gp.status='active' and g.lifecycle in ('starting','active')
    ) then return jsonb_build_object('ok',false,'code','ACTIVE_GAME_EXISTS'); end if;
  end if;
  if p_action='membership' then
    select r.* into v_room
    from public.durak_rooms r
    join public.durak_room_seats s on s.room_id=r.id
    where s.player_id=v_player and s.occupant_type='human'
      and r.lifecycle in ('waiting','playing')
    order by r.created_at desc limit 1;
    if not found then return jsonb_build_object('ok',true,'membership',null); end if;
    return jsonb_build_object('ok',true,'membership',jsonb_build_object(
      'code',v_room.code,'lifecycle',v_room.lifecycle));
  end if;
  if p_action='create' then
    if p_variant not in ('podkidnoy','perevodnoy') or p_capacity not between 2 and 6 then
      return jsonb_build_object('ok',false,'code','INVALID_OPTIONS');
    end if;
    -- Collision-resistant room codes, generated server-side; retry unique violations.
    for v_count in 1..12 loop
      v_code := upper(substr(encode(gen_random_bytes(9),'hex'),1,6));
      begin
        insert into public.durak_rooms(code,host_player_id,variant,capacity)
          values(v_code,v_player,p_variant,p_capacity) returning * into v_room;
        exit;
      exception when unique_violation then
        if v_count=12 then return jsonb_build_object('ok',false,'code','SERVICE_UNAVAILABLE'); end if;
      end;
    end loop;
    for v_seat in 0..(p_capacity-1) loop
      insert into public.durak_room_seats(room_id,seat_index,occupant_type,player_id)
      values(v_room.id,v_seat,case when v_seat=0 then 'human' else 'empty' end,
        case when v_seat=0 then v_player else null end);
    end loop;
  elsif p_action='list' then
    return jsonb_build_object('ok',true,'rooms',coalesce((
      select jsonb_agg(x.info order by x.created_at desc)
      from (select r.created_at,jsonb_build_object('code',r.code,'variant',r.variant,
        'capacity',r.capacity,'hostName',p.display_name,
        'occupied',(select count(*) from public.durak_room_seats s where s.room_id=r.id and s.occupant_type<>'empty')) info
        from public.durak_rooms r join public.players p on p.id=r.host_player_id
        where r.lifecycle='waiting' and exists(select 1 from public.durak_room_seats s where s.room_id=r.id and s.occupant_type='empty')
      ) x), '[]'::jsonb));
  else
    select * into v_room from public.durak_rooms where code=upper(trim(p_code)) for update;
    if not found then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND'); end if;
    if p_action='join' then
      if v_room.lifecycle<>'waiting' then return jsonb_build_object('ok',false,'code','ROOM_ALREADY_STARTED'); end if;
      select seat_index into v_seat from public.durak_room_seats
        where room_id=v_room.id and occupant_type='empty' order by seat_index for update skip locked limit 1;
      if v_seat is null then return jsonb_build_object('ok',false,'code','ROOM_FULL'); end if;
      update public.durak_room_seats set occupant_type='human',player_id=v_player
        where room_id=v_room.id and seat_index=v_seat;
      update public.durak_rooms set version=version+1,updated_at=now() where id=v_room.id;
    elsif p_action='leave' then
      if v_room.lifecycle<>'waiting' then return jsonb_build_object('ok',false,'code','ROOM_ALREADY_STARTED'); end if;
      if not exists(select 1 from public.durak_room_seats where room_id=v_room.id and player_id=v_player and occupant_type='human') then
        return jsonb_build_object('ok',false,'code','NOT_A_MEMBER');
      end if;
      if v_room.host_player_id=v_player then
        delete from public.durak_rooms where id=v_room.id;
        return jsonb_build_object('ok',true,'cancelled',true);
      end if;
      update public.durak_room_seats set occupant_type='empty',player_id=null
        where room_id=v_room.id and player_id=v_player;
      update public.durak_rooms set version=version+1,updated_at=now() where id=v_room.id;
      return jsonb_build_object('ok',true,'cancelled',false);
    elsif p_action='get' then
      if not exists(select 1 from public.durak_room_seats
        where room_id=v_room.id and player_id=v_player and occupant_type='human') then
        return jsonb_build_object('ok',false,'code','NOT_A_MEMBER');
      end if;
    end if;
  end if;
  select * into v_room from public.durak_rooms where id=v_room.id;
  return jsonb_build_object('ok',true,'room',jsonb_build_object(
    'code',v_room.code,'variant',v_room.variant,'capacity',v_room.capacity,
    'lifecycle',v_room.lifecycle,'version',v_room.version,
    'hostPlayerId',v_room.host_player_id,
    'seats',(select coalesce(jsonb_agg(jsonb_build_object('index',s.seat_index,
      'occupant',s.occupant_type,'name',coalesce(p.display_name,s.bot_display_name)) order by s.seat_index),'[]'::jsonb)
      from public.durak_room_seats s left join public.players p on p.id=s.player_id where s.room_id=v_room.id)
  ));
end;
$$;
revoke all on function public.durak_room_command_internal(text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.durak_room_command_internal(text,text,text,text,integer) to service_role;

-- Global invariant: one human may occupy at most one waiting/active game,
-- regardless of game type. Same per-player advisory lock for JOKER and DURAK.
-- Applied after DURAK storage migration.
create or replace function private.ensure_single_open_room_internal()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
begin
  if new.occupant_type <> 'human' or new.player_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.player_id::text, 20261009));
  if exists (
    select 1 from public.room_seats s join public.rooms r on r.id=s.room_id
    where s.player_id=new.player_id and s.occupant_type='human'
      and s.room_id<>new.room_id and r.status='lobby'
  ) or exists (
    select 1 from public.game_participants gp join public.games g on gp.game_id=g.id
    where gp.player_id=new.player_id and gp.owner_type='human' and gp.status='active' and g.lifecycle in ('starting','active')
      and g.room_id<>new.room_id
  ) or exists (
    select 1 from public.durak_room_seats ds join public.durak_rooms dr on ds.room_id=dr.id
    where ds.player_id=new.player_id and ds.occupant_type='human'
      and dr.lifecycle in ('waiting','playing')
  ) then
    raise exception 'ACTIVE_GAME_EXISTS' using errcode = '23505';
  end if;
  return new;
end;
$$;

create or replace function private.durak_enforce_global_one_game()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
begin
  if new.occupant_type <> 'human' or new.player_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.player_id::text, 20261009));
  if exists (
    select 1 from public.durak_room_seats ds join public.durak_rooms dr on dr.id=ds.room_id
    where ds.player_id=new.player_id and ds.occupant_type='human'
      and ds.room_id<>new.room_id and dr.lifecycle in ('waiting','playing')
  ) or exists (
    select 1 from public.room_seats s join public.rooms r on r.id=s.room_id
    where s.player_id=new.player_id and s.occupant_type='human' and r.status='lobby'
  ) or exists (
    select 1 from public.game_participants gp join public.games g on g.id=gp.game_id
    where gp.player_id=new.player_id and gp.owner_type='human' and gp.status='active' and g.lifecycle in ('starting','active')
  ) then
    raise exception 'ACTIVE_GAME_EXISTS' using errcode='23505';
  end if;
  return new;
end;
$$;
drop trigger if exists durak_global_one_game on public.durak_room_seats;
create trigger durak_global_one_game
before insert or update of occupant_type, player_id on public.durak_room_seats
for each row execute function private.durak_enforce_global_one_game();
revoke all on function private.durak_enforce_global_one_game() from public,anon,authenticated;
