create or replace function public.get_current_active_game_internal(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_player_id uuid;
  v_active jsonb;
  v_game_id uuid;
  v_result jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  v_active := private.active_game_for_player_internal(v_player_id);
  if v_active is null then
    return jsonb_build_object('ok', true, 'activeGame', null);
  end if;

  v_game_id := (v_active->>'gameId')::uuid;

  select jsonb_build_object(
    'gameId', g.id,
    'roomCode', r.code,
    'seatIndex', gp.seat_index,
    'lifecycle', g.lifecycle,
    'stateVersion', g.state_version
  )
  into v_result
  from public.games g
  join public.rooms r on r.id = g.room_id
  join public.game_participants gp
    on gp.game_id = g.id
   and gp.owner_type = 'human'
   and gp.player_id = v_player_id
   and gp.status = 'active'
  where g.id = v_game_id
  limit 1;

  if v_result is null then
    return jsonb_build_object('ok', true, 'activeGame', null);
  end if;

  return jsonb_build_object('ok', true, 'activeGame', v_result);
end;
$$;

revoke all on function public.get_current_active_game_internal(text) from public, anon, authenticated;
grant execute on function public.get_current_active_game_internal(text) to service_role;
