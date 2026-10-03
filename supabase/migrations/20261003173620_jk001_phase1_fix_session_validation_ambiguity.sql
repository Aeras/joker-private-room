create or replace function public.validate_player_session_internal(p_session_token text)
returns table(id uuid, display_name text, is_host boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_token_hash bytea;
  v_session record;
begin
  if coalesce(p_session_token, '') = '' then
    return;
  end if;

  v_token_hash := digest(p_session_token, 'sha256');

  select ps.id, ps.player_id, ps.expires_at, ps.revoked_at, ps.active_control
    into v_session
  from private.player_sessions as ps
  where ps.token_hash = v_token_hash
  limit 1
  for update;

  if not found then
    return;
  end if;

  if v_session.revoked_at is not null or not v_session.active_control or v_session.expires_at <= v_now then
    if v_session.revoked_at is null and v_session.active_control and v_session.expires_at <= v_now then
      update private.player_sessions as ps
      set active_control = false,
          revoked_at = v_now
      where ps.id = v_session.id;
    end if;
    return;
  end if;

  update private.player_sessions as ps
  set last_seen_at = v_now
  where ps.id = v_session.id;

  return query
  select p.id, p.display_name, p.is_host, v_session.expires_at
  from public.players as p
  where p.id = v_session.player_id and p.is_active = true;
end;
$$;

revoke all on function public.validate_player_session_internal(text) from public, anon, authenticated;
grant execute on function public.validate_player_session_internal(text) to service_role;
