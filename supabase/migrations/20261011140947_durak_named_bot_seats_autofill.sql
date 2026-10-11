-- Trusted DURAK-only lobby setup. Room lock serializes joining, selection and start.
-- The catalog comes from the Edge Function's shared JOKER catalog, never the browser.
create or replace function public.durak_lobby_setup_internal(
  p_session_token text, p_room_code text, p_action text, p_catalog jsonb,
  p_seat integer default null, p_bot_id text default null, p_state jsonb default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions as $$
declare
  v_player uuid;
  v_room public.durak_rooms%rowtype;
  v_target integer;
  v_bot jsonb;
  v_result jsonb;
begin
  select id into v_player from public.validate_player_session_internal(p_session_token) limit 1;
  if v_player is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  select * into v_room from public.durak_rooms where code=upper(trim(p_room_code)) for update;
  if not found then return jsonb_build_object('ok',false,'code','ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id<>v_player or v_room.lifecycle<>'waiting' then
    return jsonb_build_object('ok',false,'code','HOST_ONLY'); end if;
  if not exists(select 1 from public.durak_room_seats where room_id=v_room.id
    and occupant_type='human' and player_id=v_player) then
    return jsonb_build_object('ok',false,'code','NOT_A_MEMBER'); end if;
  if p_action not in ('bot_add','start') then
    return jsonb_build_object('ok',false,'code','INVALID_ACTION'); end if;
  if jsonb_typeof(p_catalog) is distinct from 'array' or jsonb_array_length(p_catalog)<6 then
    return jsonb_build_object('ok',false,'code','INVALID_BOT'); end if;
  if p_action='bot_add' then
    v_target := p_seat;
    if v_target is null then
      select seat_index into v_target from public.durak_room_seats where room_id=v_room.id
        and occupant_type='empty' order by seat_index limit 1;
    end if;
    if v_target is null or not exists(select 1 from public.durak_room_seats
      where room_id=v_room.id and seat_index=v_target and occupant_type in ('empty','bot')) then
      return jsonb_build_object('ok',false,'code','INVALID_BOT'); end if;
    select item into v_bot from jsonb_array_elements(p_catalog) with ordinality as bots(item,ord)
      where (p_bot_id is null or item->>'id'=p_bot_id)
      and not exists(select 1 from public.durak_room_seats where room_id=v_room.id
        and seat_index<>v_target and occupant_type='bot' and bot_id=item->>'id')
      order by ord limit 1;
    if v_bot is null then return jsonb_build_object('ok',false,'code','BOT_UNAVAILABLE'); end if;
    update public.durak_room_seats set occupant_type='bot',player_id=null,
      bot_id=v_bot->>'id',bot_display_name=v_bot->>'displayName'
      where room_id=v_room.id and seat_index=v_target;
    update public.durak_rooms set version=version+1,updated_at=now() where id=v_room.id;
    return jsonb_build_object('ok',true,'updated',true);
  end if;
  if jsonb_typeof(p_state) is distinct from 'object' or (p_state->>'variant') is distinct from v_room.variant
    or jsonb_array_length(p_state->'hands') is distinct from v_room.capacity
    or (p_state->>'ended') is distinct from 'false' then
    return jsonb_build_object('ok',false,'code','INVALID_STATE'); end if;
  -- Normalize legacy placeholder bots in waiting rooms, preserving real humans.
  for v_target in select seat_index from public.durak_room_seats where room_id=v_room.id
    and (occupant_type='empty' or (occupant_type='bot' and not exists(
      select 1 from jsonb_array_elements(p_catalog) bot where bot->>'id'=bot_id))) order by seat_index
  loop
    select item into v_bot from jsonb_array_elements(p_catalog) with ordinality as bots(item,ord)
      where not exists(select 1 from public.durak_room_seats where room_id=v_room.id
        and occupant_type='bot' and bot_id=item->>'id') order by ord limit 1;
    if v_bot is null then raise exception 'DURAK bot catalog exhausted'; end if;
    update public.durak_room_seats set occupant_type='bot',player_id=null,
      bot_id=v_bot->>'id',bot_display_name=v_bot->>'displayName'
      where room_id=v_room.id and seat_index=v_target;
  end loop;
  v_result := public.durak_match_command_internal(p_session_token,p_room_code,'start',null,p_state,null);
  -- Roll back auto-fill as well if the canonical start rejects the transaction.
  if (v_result->>'ok') is distinct from 'true' then raise exception 'DURAK start rejected'; end if;
  return v_result;
end;
$$;
revoke all on function public.durak_lobby_setup_internal(text,text,text,jsonb,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.durak_lobby_setup_internal(text,text,text,jsonb,integer,text,jsonb) to service_role;
