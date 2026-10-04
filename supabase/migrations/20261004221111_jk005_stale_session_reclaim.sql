-- JK-005: reclaim stale single-controller sessions only when the player has no active game.
-- This keeps genuine concurrent-control protection while preventing an abandoned browser
-- session from blocking a later login for the full 24-hour token lifetime.

create or replace function public.reclaim_stale_player_session_for_auth_internal(
  p_player_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer := 0;
begin
  if p_player_id is null then
    return false;
  end if;

  -- Never auto-reclaim control while the player still owns a genuinely active game.
  if private.active_game_for_player_internal(p_player_id) is not null then
    return false;
  end if;

  update private.player_sessions as ps
  set active_control = false,
      revoked_at = coalesce(ps.revoked_at, v_now)
  where ps.player_id = p_player_id
    and ps.active_control = true
    and ps.revoked_at is null
    and ps.last_seen_at <= v_now - interval '5 minutes';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.reclaim_stale_player_session_for_auth_internal(uuid)
  from public, anon, authenticated;
grant execute on function public.reclaim_stale_player_session_for_auth_internal(uuid)
  to service_role;

-- Repair already-stale sessions immediately. The active-game invariant prevents this
-- backfill from taking control away from a player who still has a live game.
update private.player_sessions as ps
set active_control = false,
    revoked_at = coalesce(ps.revoked_at, clock_timestamp())
where ps.active_control = true
  and ps.revoked_at is null
  and ps.last_seen_at <= clock_timestamp() - interval '5 minutes'
  and private.active_game_for_player_internal(ps.player_id) is null;
