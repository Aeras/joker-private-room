-- Preserve login sessions when a host ends a game. Only release active game control.
-- This replaces the prior JK-006 termination function without altering authoritative termination.
-- JK-006: preserve the terminal canonical response, release active control without revoking login.

create or replace function public.terminate_game_by_host_internal(
  p_session_token text,
  p_game_id uuid,
  p_action_id uuid,
  p_expected_state_version bigint,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_player_id uuid;
  v_viewer_seat integer;
  v_game public.games%rowtype;
  v_host_player_id uuid;
  v_existing private.game_command_ledger%rowtype;
  v_next_version bigint;
  v_now timestamptz := clock_timestamp();
  v_new_state jsonb;
  v_result jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if p_action_id is null
     or p_expected_state_version is null
     or p_expected_state_version < 0
     or coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select * into v_existing
  from private.game_command_ledger
  where actor_player_id = v_player_id
    and action_id = p_action_id;
  if found then
    if v_existing.game_id <> p_game_id
       or v_existing.command_type <> 'host_end_game'
       or v_existing.expected_state_version <> p_expected_state_version
       or v_existing.request_fingerprint <> lower(p_request_fingerprint) then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  select g.* into v_game
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  select r.host_player_id into v_host_player_id
  from public.rooms r
  where r.id = v_game.room_id;

  if v_host_player_id <> v_player_id then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;

  select gp.seat_index into v_viewer_seat
  from public.game_participants gp
  where gp.game_id = v_game.id
    and gp.owner_type = 'human'
    and gp.player_id = v_player_id
  limit 1;

  if v_viewer_seat is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;
  if v_game.lifecycle not in ('starting', 'active') then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE');
  end if;
  if v_game.state_version <> p_expected_state_version then
    return jsonb_build_object('ok', false, 'code', 'STALE_STATE', 'currentStateVersion', v_game.state_version);
  end if;
  if v_game.canonical_state is null or jsonb_typeof(v_game.canonical_state) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'GAME_STATE_NOT_INITIALIZED');
  end if;

  v_next_version := v_game.state_version + 1;
  v_new_state := jsonb_set(v_game.canonical_state, '{stateVersion}', to_jsonb(v_next_version), true);
  v_new_state := jsonb_set(v_new_state, '{lifecycle}', '"complete"'::jsonb, true);
  v_new_state := jsonb_set(
    v_new_state,
    '{termination}',
    jsonb_build_object('kind', 'host_ended', 'endedAt', v_now),
    true
  );
  v_new_state := jsonb_set(v_new_state, '{progression,currentActorSeat}', 'null'::jsonb, true);
  v_new_state := jsonb_set(v_new_state, '{timing,currentHumanDeadline}', 'null'::jsonb, true);
  v_new_state := jsonb_set(v_new_state, '{timing,timeoutTakeoverActive}', 'false'::jsonb, true);

  update public.games
  set canonical_state = v_new_state,
      state_version = v_next_version,
      lifecycle = 'complete',
      completed_at = coalesce(completed_at, v_now),
      next_wakeup_at = null
  where id = v_game.id;

  update private.player_sessions ps
  set active_control = false,
      last_seen_at = v_now
  where ps.player_id in (
    select gp.player_id
    from public.game_participants gp
    where gp.game_id = v_game.id
      and gp.owner_type = 'human'
      and gp.player_id is not null
  )
    and ps.active_control = true
    and ps.revoked_at is null;

  update public.game_participants
  set status = 'completed',
      final_score = null,
      final_placement = null
  where game_id = v_game.id
    and status = 'active';

  delete from private.game_reconciliation_claims
  where game_id = v_game.id;

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'stateVersion', v_next_version,
    'lifecycle', 'complete',
    'terminationReason', 'host_ended',
    'sessionsReleased', true,
    'viewerSeat', v_viewer_seat,
    'canonicalState', v_new_state,
    'replayed', false
  );

  insert into private.game_command_ledger(
    actor_player_id, action_id, game_id, command_type,
    expected_state_version, request_fingerprint, result
  ) values (
    v_player_id, p_action_id, v_game.id, 'host_end_game',
    p_expected_state_version, lower(p_request_fingerprint), v_result
  );

  return v_result;
end;
$$;

revoke all on function public.terminate_game_by_host_internal(text, uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.terminate_game_by_host_internal(text, uuid, uuid, bigint, text)
  to service_role;
