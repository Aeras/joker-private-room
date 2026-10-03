create or replace function public.load_game_state_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_player_id uuid;
  v_viewer_seat smallint;
  v_game public.games%rowtype;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select g.*, gp.seat_index
    into v_game, v_viewer_seat
  from public.games g
  join public.game_participants gp on gp.game_id = g.id
  where g.id = p_game_id
    and gp.owner_type = 'human'
    and gp.player_id = v_player_id
    and gp.status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  if v_game.canonical_state is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'GAME_STATE_NOT_INITIALIZED',
      'gameId', v_game.id,
      'stateVersion', v_game.state_version
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'roomId', v_game.room_id,
    'viewerSeat', v_viewer_seat,
    'rulesetId', v_game.ruleset_id,
    'rulesVersion', v_game.rules_version,
    'stateSchemaVersion', v_game.state_schema_version,
    'stateVersion', v_game.state_version,
    'lifecycle', v_game.lifecycle,
    'canonicalState', v_game.canonical_state
  );
end;
$$;

revoke all on function public.load_game_state_internal(text, uuid) from public, anon, authenticated;
grant execute on function public.load_game_state_internal(text, uuid) to service_role;
