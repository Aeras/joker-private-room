-- Session-first lobby: private room discovery, waiting-room resumption and explicit pre-start leave.
-- No changes to existing card rules, game state or running-game controller.
create or replace function public.list_waiting_rooms_internal(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare v_player uuid; v_rooms jsonb;
begin
  select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
  if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  select coalesce(jsonb_agg(info order by created_at desc), '[]'::jsonb) into v_rooms
  from (
    select r.created_at, jsonb_build_object(
      'code',r.code, 'hostName',p.display_name, 'rulesetId',r.ruleset_id,
      'occupied', (select count(*) from public.room_seats s where s.room_id=r.id and s.occupant_type<>'empty'),
      'humans', (select count(*) from public.room_seats s where s.room_id=r.id and s.occupant_type='human')
    ) as info
    from public.rooms r join public.players p on p.id=r.host_player_id
    where r.status='lobby'
      and exists (select 1 from public.room_seats s where s.room_id=r.id and s.occupant_type='empty')
  ) public_rooms;
  return jsonb_build_object('ok',true,'rooms',v_rooms);
end;
$$;
revoke all on function public.list_waiting_rooms_internal(text) from public,anon,authenticated;
grant execute on function public.list_waiting_rooms_internal(text) to service_role;

create or replace function public.get_current_room_membership_internal(p_session_token text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare v_player uuid; v_result jsonb;
begin
  select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
  if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  select jsonb_build_object('code',r.code,'lifecycle',r.status,'gameId',r.current_game_id)
  into v_result
  from public.rooms r join public.room_seats s on s.room_id=r.id
  where s.player_id=v_player and s.occupant_type='human'
    and (r.status='lobby' or exists (
      select 1 from public.game_participants gp join public.games g on gp.game_id=g.id
      where g.room_id=r.id and gp.player_id=v_player and gp.status='active'
    ))
  order by (r.status='playing') desc, r.created_at desc limit 1;
  return jsonb_build_object('ok',true,'membership',v_result);
end;
$$;
revoke all on function public.get_current_room_membership_internal(text) from public,anon,authenticated;
grant execute on function public.get_current_room_membership_internal(text) to service_role;

create or replace function public.leave_waiting_room_internal(p_session_token text, p_code text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare v_player uuid; v_room public.rooms%rowtype; v_is_member boolean;
begin
  select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
  if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  select * into v_room from public.rooms where code=upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND'); end if;
  if v_room.status<>'lobby' then return jsonb_build_object('ok',false,'code','ROOM_ALREADY_STARTED'); end if;
  select exists(select 1 from public.room_seats s where s.room_id=v_room.id and s.player_id=v_player and s.occupant_type='human')
  into v_is_member;
  if not v_is_member then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id=v_player then
    -- A deliberate host exit cancels the room; clients return to room discovery.
    delete from public.rooms where id=v_room.id;
    return jsonb_build_object('ok',true,'cancelled',true);
  end if;
  update public.room_seats set occupant_type='empty',player_id=null,connected=false
    where room_id=v_room.id and player_id=v_player and occupant_type='human';
  update public.rooms set room_version=room_version+1,updated_at=now() where id=v_room.id;
  return jsonb_build_object('ok',true,'cancelled',false);
end;
$$;
revoke all on function public.leave_waiting_room_internal(text,text) from public,anon,authenticated;
grant execute on function public.leave_waiting_room_internal(text,text) to service_role;
