-- JK-007: verified PIN can resume an owned active game on a new device.
-- No gameplay/participant changes; old controller is revoked atomically.
create or replace function public.authenticate_player_pin_internal(
  p_player_id uuid,
  p_pin text,
  p_source text,
  p_current_session_token text default null
)
returns table(
  result_code text,
  out_player_id uuid,
  out_display_name text,
  out_is_host boolean,
  session_token text,
  reuse_session boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_pin_hash text;
  v_failed integer;
  v_stage integer;
  v_next_attempt timestamptz;
  v_wait integer;
  v_player record;
  v_source_hash bytea;
  v_source_window timestamptz;
  v_source_count integer;
  v_source_blocked timestamptz;
  v_live_session_id uuid;
  v_live_token_hash bytea;
  v_current_token_hash bytea;
  v_new_token text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return query select 'INVALID_CREDENTIALS', null::uuid, null::text, null::boolean, null::text, false, null::integer;
    return;
  end if;

  if coalesce(btrim(p_source), '') <> '' then
    v_source_hash := digest(p_source, 'sha256');

    insert into private.auth_source_throttle(source_hash, window_started_at, attempt_count, updated_at)
    values (v_source_hash, v_now, 0, v_now)
    on conflict (source_hash) do nothing;

    select window_started_at, attempt_count, blocked_until
      into v_source_window, v_source_count, v_source_blocked
    from private.auth_source_throttle
    where source_hash = v_source_hash
    for update;

    if v_source_blocked is not null and v_source_blocked > v_now then
      return query select
        'PIN_COOLDOWN_ACTIVE', null::uuid, null::text, null::boolean, null::text, false,
        greatest(1, ceil(extract(epoch from (v_source_blocked - v_now)))::integer);
      return;
    end if;

    if v_source_window <= v_now - interval '10 minutes' then
      update private.auth_source_throttle
      set window_started_at = v_now,
          attempt_count = 1,
          blocked_until = null,
          updated_at = v_now
      where source_hash = v_source_hash;
      v_source_count := 1;
    else
      v_source_count := v_source_count + 1;
      if v_source_count > 60 then
        v_source_blocked := v_now + interval '15 minutes';
        update private.auth_source_throttle
        set attempt_count = v_source_count,
            blocked_until = v_source_blocked,
            updated_at = v_now
        where source_hash = v_source_hash;

        return query select 'PIN_COOLDOWN_ACTIVE', null::uuid, null::text, null::boolean, null::text, false, 900;
        return;
      else
        update private.auth_source_throttle
        set attempt_count = v_source_count,
            blocked_until = null,
            updated_at = v_now
        where source_hash = v_source_hash;
      end if;
    end if;
  end if;

  select c.pin_hash, c.failed_attempt_count, c.backoff_stage, c.next_attempt_at
    into v_pin_hash, v_failed, v_stage, v_next_attempt
  from private.player_credentials c
  where c.player_id = p_player_id
  for update;

  if not found then
    return query select 'INVALID_CREDENTIALS', null::uuid, null::text, null::boolean, null::text, false, null::integer;
    return;
  end if;

  if v_next_attempt is not null and v_next_attempt > v_now then
    return query select
      'PIN_COOLDOWN_ACTIVE', null::uuid, null::text, null::boolean, null::text, false,
      greatest(1, ceil(extract(epoch from (v_next_attempt - v_now)))::integer);
    return;
  end if;

  select p.id, p.display_name, p.is_host
    into v_player
  from public.players p
  where p.id = p_player_id and p.is_active = true;

  if not found or v_pin_hash <> crypt(p_pin, v_pin_hash) then
    v_failed := v_failed + 1;
    v_wait := null;

    if v_failed >= 5 then
      v_stage := least(v_stage + 1, 5);
      v_wait := case v_stage
        when 1 then 60
        when 2 then 120
        when 3 then 240
        when 4 then 480
        else 900
      end;
      v_next_attempt := v_now + make_interval(secs => v_wait);
    else
      v_stage := 0;
      v_next_attempt := null;
    end if;

    update private.player_credentials
    set failed_attempt_count = v_failed,
        backoff_stage = v_stage,
        next_attempt_at = v_next_attempt,
        last_failure_at = v_now,
        updated_at = v_now
    where player_id = p_player_id;

    return query select 'INVALID_CREDENTIALS', null::uuid, null::text, null::boolean, null::text, false, v_wait;
    return;
  end if;

  update private.player_credentials
  set failed_attempt_count = 0,
      backoff_stage = 0,
      next_attempt_at = null,
      last_failure_at = null,
      updated_at = v_now
  where player_id = p_player_id;

  update private.player_sessions
  set active_control = false,
      revoked_at = coalesce(revoked_at, v_now)
  where player_id = p_player_id
    and active_control = true
    and revoked_at is null
    and expires_at <= v_now;

  if coalesce(p_current_session_token, '') <> '' then
    v_current_token_hash := digest(p_current_session_token, 'sha256');
  end if;

  select s.id, s.token_hash
    into v_live_session_id, v_live_token_hash
  from private.player_sessions s
  where s.player_id = p_player_id
    and s.active_control = true
    and s.revoked_at is null
    and s.expires_at > v_now
  order by s.issued_at desc
  limit 1
  for update;

  if found then
    if v_current_token_hash is not null and v_current_token_hash = v_live_token_hash then
      update private.player_sessions
      set last_seen_at = v_now
      where id = v_live_session_id;

      return query select 'OK', v_player.id, v_player.display_name, v_player.is_host, null::text, true, null::integer;
      return;
    end if;

    -- PIN and throttles have already been verified under the credentials row lock.
    -- Resume an owned active game on a new device, keeping exactly one controller.
    if private.active_game_for_player_internal(p_player_id) is null then
      return query select 'SECOND_ACTIVE_CONNECTION', null::uuid, null::text, null::boolean, null::text, false, null::integer;
      return;
    end if;

    update private.player_sessions
    set active_control = false, revoked_at = v_now
    where id = v_live_session_id;
    -- Fall through to fresh token creation; never return the old device's token.
  end if;

  v_new_token := encode(gen_random_bytes(32), 'hex');

  insert into private.player_sessions(player_id, token_hash, issued_at, expires_at, last_seen_at, active_control)
  values (p_player_id, digest(v_new_token, 'sha256'), v_now, v_now + interval '24 hours', v_now, true);

  return query select 'OK', v_player.id, v_player.display_name, v_player.is_host, v_new_token, false, null::integer;
end;
$$;

revoke all on function public.authenticate_player_pin_internal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.authenticate_player_pin_internal(uuid, text, text, text) to service_role;


