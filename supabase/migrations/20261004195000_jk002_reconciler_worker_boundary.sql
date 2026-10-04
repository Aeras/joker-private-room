create table if not exists private.game_reconciler_invocations (
  token uuid primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.game_reconciliation_claims (
  game_id uuid primary key references public.games(id) on delete cascade,
  claim_token uuid not null,
  claimed_state_version bigint not null,
  claim_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.game_reconciliation_command_ledger (
  action_id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  command_type text not null check (command_type ~ '^[a-z0-9_]{1,64}$'),
  expected_state_version bigint not null check (expected_state_version >= 0),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now()
);

revoke all on private.game_reconciler_invocations from public, anon, authenticated;
revoke all on private.game_reconciliation_claims from public, anon, authenticated;
revoke all on private.game_reconciliation_command_ledger from public, anon, authenticated;
grant all on private.game_reconciler_invocations to service_role;
grant all on private.game_reconciliation_claims to service_role;
grant all on private.game_reconciliation_command_ledger to service_role;

create or replace function public.issue_game_reconciler_invocation_internal()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  delete from private.game_reconciler_invocations
  where expires_at < now() - interval '5 minutes'
     or consumed_at is not null;

  insert into private.game_reconciler_invocations(token, expires_at)
  values (v_token, now() + interval '2 minutes');

  return v_token;
end;
$$;

create or replace function public.consume_game_reconciler_invocation_internal(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_consumed uuid;
begin
  update private.game_reconciler_invocations
  set consumed_at = now()
  where token = p_token
    and consumed_at is null
    and expires_at >= now()
  returning token into v_consumed;

  return v_consumed is not null;
end;
$$;

create or replace function private.valid_game_reconciliation_claim_internal(
  p_game_id uuid,
  p_claim_token uuid
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, private
as $$
  select exists (
    select 1
    from private.game_reconciliation_claims c
    where c.game_id = p_game_id
      and c.claim_token = p_claim_token
      and c.claim_until >= now()
  );
$$;

create or replace function public.claim_due_games_for_reconciliation_internal(
  p_limit integer default 4,
  p_lease_seconds integer default 45
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 4), 8));
  v_lease_seconds integer := greatest(10, least(coalesce(p_lease_seconds, 45), 120));
  v_result jsonb;
begin
  with due as (
    select g.id, g.state_version
    from public.games g
    left join private.game_reconciliation_claims c on c.game_id = g.id
    where g.lifecycle in ('starting', 'active')
      and g.next_wakeup_at is not null
      and g.next_wakeup_at <= now()
      and (c.game_id is null or c.claim_until < now())
    order by g.next_wakeup_at, g.id
    for update of g skip locked
    limit v_limit
  ), claimed as (
    insert into private.game_reconciliation_claims(
      game_id, claim_token, claimed_state_version, claim_until, updated_at
    )
    select
      d.id,
      gen_random_uuid(),
      d.state_version,
      now() + make_interval(secs => v_lease_seconds),
      now()
    from due d
    on conflict (game_id) do update
      set claim_token = excluded.claim_token,
          claimed_state_version = excluded.claimed_state_version,
          claim_until = excluded.claim_until,
          updated_at = now()
      where private.game_reconciliation_claims.claim_until < now()
    returning game_id, claim_token, claimed_state_version, claim_until
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'gameId', game_id,
        'claimToken', claim_token,
        'stateVersion', claimed_state_version,
        'claimUntil', claim_until
      )
      order by game_id
    ),
    '[]'::jsonb
  )
  into v_result
  from claimed;

  return v_result;
end;
$$;

create or replace function public.release_game_reconciliation_claim_internal(
  p_game_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_deleted uuid;
begin
  delete from private.game_reconciliation_claims
  where game_id = p_game_id
    and claim_token = p_claim_token
  returning game_id into v_deleted;

  return v_deleted is not null;
end;
$$;

create or replace function public.load_game_state_for_reconciliation_internal(
  p_game_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_game public.games%rowtype;
begin
  if not private.valid_game_reconciliation_claim_internal(p_game_id, p_claim_token) then
    return jsonb_build_object('ok', false, 'code', 'CLAIM_NOT_HELD');
  end if;

  select g.* into v_game
  from public.games g
  where g.id = p_game_id;

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
    'stateVersion', v_game.state_version,
    'canonicalState', v_game.canonical_state
  );
end;
$$;

create or replace function public.persist_game_state_for_reconciliation_internal(
  p_game_id uuid,
  p_claim_token uuid,
  p_action_id uuid,
  p_command_type text,
  p_expected_state_version bigint,
  p_request_fingerprint text,
  p_new_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_game public.games%rowtype;
  v_existing private.game_reconciliation_command_ledger%rowtype;
  v_next_version bigint;
  v_new_lifecycle text;
  v_result jsonb;
begin
  if not private.valid_game_reconciliation_claim_internal(p_game_id, p_claim_token) then
    return jsonb_build_object('ok', false, 'code', 'CLAIM_NOT_HELD');
  end if;

  if p_action_id is null
     or coalesce(p_command_type, '') !~ '^[a-z0-9_]{1,64}$'
     or coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or p_expected_state_version is null
     or p_expected_state_version < 0
     or p_new_state is null
     or jsonb_typeof(p_new_state) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select * into v_existing
  from private.game_reconciliation_command_ledger l
  where l.action_id = p_action_id;

  if found then
    if v_existing.game_id = p_game_id
       and v_existing.command_type = p_command_type
       and v_existing.expected_state_version = p_expected_state_version
       and v_existing.request_fingerprint = lower(p_request_fingerprint) then
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
  end if;

  select g.* into v_game
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  if v_game.state_version <> p_expected_state_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'STALE_STATE',
      'currentStateVersion', v_game.state_version
    );
  end if;

  v_next_version := v_game.state_version + 1;
  v_new_lifecycle := p_new_state->>'lifecycle';

  if (p_new_state->>'gameId') is distinct from v_game.id::text
     or (p_new_state->>'roomId') is distinct from v_game.room_id::text
     or (p_new_state->>'rulesetId') is distinct from v_game.ruleset_id
     or (p_new_state->>'rulesVersion') is distinct from v_game.rules_version
     or coalesce(p_new_state->>'stateSchemaVersion', '') !~ '^[0-9]+$'
     or (p_new_state->>'stateSchemaVersion')::integer <> v_game.state_schema_version
     or coalesce(p_new_state->>'stateVersion', '') !~ '^[0-9]+$'
     or (p_new_state->>'stateVersion')::bigint <> v_next_version
     or coalesce(v_new_lifecycle, '') not in ('starting', 'active', 'complete') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CANONICAL_STATE');
  end if;

  if v_new_lifecycle = 'complete' then
    return jsonb_build_object('ok', false, 'code', 'FINALIZATION_REQUIRED');
  end if;

  update public.games
  set canonical_state = p_new_state,
      state_version = v_next_version,
      lifecycle = v_new_lifecycle
  where id = v_game.id;

  update private.game_reconciliation_claims
  set claimed_state_version = v_next_version,
      claim_until = greatest(claim_until, now() + interval '30 seconds'),
      updated_at = now()
  where game_id = p_game_id
    and claim_token = p_claim_token;

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'stateVersion', v_next_version,
    'lifecycle', v_new_lifecycle,
    'replayed', false
  );

  insert into private.game_reconciliation_command_ledger(
    action_id, game_id, command_type, expected_state_version, request_fingerprint, result
  ) values (
    p_action_id, p_game_id, p_command_type,
    p_expected_state_version, lower(p_request_fingerprint), v_result
  );

  return v_result;
end;
$$;

create or replace function public.finalize_game_for_reconciliation_internal(
  p_game_id uuid,
  p_claim_token uuid,
  p_action_id uuid,
  p_expected_state_version bigint,
  p_request_fingerprint text,
  p_new_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_game public.games%rowtype;
  v_existing private.game_reconciliation_command_ledger%rowtype;
  v_next_version bigint;
  v_result jsonb;
  v_participants jsonb;
begin
  if not private.valid_game_reconciliation_claim_internal(p_game_id, p_claim_token) then
    return jsonb_build_object('ok', false, 'code', 'CLAIM_NOT_HELD');
  end if;

  if p_action_id is null
     or coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
     or p_expected_state_version is null
     or p_expected_state_version < 0
     or p_new_state is null
     or jsonb_typeof(p_new_state) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select * into v_existing
  from private.game_reconciliation_command_ledger l
  where l.action_id = p_action_id;

  if found then
    if v_existing.game_id = p_game_id
       and v_existing.command_type = 'finalize_game'
       and v_existing.expected_state_version = p_expected_state_version
       and v_existing.request_fingerprint = lower(p_request_fingerprint) then
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
  end if;

  select g.* into v_game
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  if v_game.state_version <> p_expected_state_version then
    return jsonb_build_object(
      'ok', false,
      'code', 'STALE_STATE',
      'currentStateVersion', v_game.state_version
    );
  end if;

  v_next_version := v_game.state_version + 1;

  if (p_new_state->>'gameId') is distinct from v_game.id::text
     or (p_new_state->>'roomId') is distinct from v_game.room_id::text
     or (p_new_state->>'rulesetId') is distinct from v_game.ruleset_id
     or (p_new_state->>'rulesVersion') is distinct from v_game.rules_version
     or coalesce(p_new_state->>'stateSchemaVersion', '') !~ '^[0-9]+$'
     or (p_new_state->>'stateSchemaVersion')::integer <> v_game.state_schema_version
     or coalesce(p_new_state->>'stateVersion', '') !~ '^[0-9]+$'
     or (p_new_state->>'stateVersion')::bigint <> v_next_version
     or (p_new_state->>'lifecycle') is distinct from 'complete'
     or (p_new_state#>>'{progression,phase}') is distinct from 'GAME_COMPLETE'
     or jsonb_typeof(p_new_state#>'{score,cumulativeTotals}') is distinct from 'array'
     or jsonb_array_length(p_new_state#>'{score,cumulativeTotals}') <> 4
     or jsonb_typeof(p_new_state#>'{score,finalPlacements}') is distinct from 'array'
     or jsonb_array_length(p_new_state#>'{score,finalPlacements}') <> 4
     or jsonb_typeof(p_new_state#>'{score,completedDeals}') is distinct from 'array'
     or jsonb_array_length(p_new_state#>'{score,completedDeals}') <> 24
     or jsonb_typeof(p_new_state#>'{score,roundPremia}') is distinct from 'array'
     or jsonb_array_length(p_new_state#>'{score,roundPremia}') <> 4 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CANONICAL_STATE');
  end if;

  if exists (
    select 1 from generate_series(0, 3) seat
    where coalesce(p_new_state#>>array['score','cumulativeTotals',seat::text], '') !~ '^-?[0-9]+$'
       or coalesce(p_new_state#>>array['score','finalPlacements',seat::text], '') !~ '^[1-4]$'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CANONICAL_STATE');
  end if;

  update public.games
  set canonical_state = p_new_state,
      state_version = v_next_version,
      lifecycle = 'complete'
  where id = v_game.id;

  update public.game_participants gp
  set status = 'completed',
      final_score = (p_new_state#>>array['score','cumulativeTotals',gp.seat_index::text])::integer,
      final_placement = (p_new_state#>>array['score','finalPlacements',gp.seat_index::text])::integer
  where gp.game_id = v_game.id
    and gp.status = 'active';

  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'seatIndex', gp.seat_index,
      'ownerType', gp.owner_type,
      'playerId', gp.player_id,
      'playerDisplayName', p.display_name,
      'botId', gp.bot_id,
      'botDisplayName', gp.bot_display_name,
      'botAvatarUrl', gp.bot_avatar_url,
      'botStrategyProfileId', gp.bot_strategy_profile_id,
      'botCatalogVersion', gp.bot_catalog_version,
      'finalScore', gp.final_score,
      'finalPlacement', gp.final_placement
    )) order by gp.seat_index
  ) into v_participants
  from public.game_participants gp
  left join public.players p on p.id = gp.player_id
  where gp.game_id = v_game.id;

  if v_participants is null or jsonb_array_length(v_participants) <> 4 then
    raise exception 'FINALIZATION_PARTICIPANT_INVARIANT_FAILED';
  end if;

  insert into public.game_history(
    game_id, room_id, completed_at, ruleset_id, rules_version, state_schema_version, participants
  ) values (
    v_game.id, v_game.room_id, now(), v_game.ruleset_id, v_game.rules_version,
    v_game.state_schema_version, v_participants
  )
  on conflict (game_id) do nothing;

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'stateVersion', v_next_version,
    'lifecycle', 'complete',
    'replayed', false
  );

  insert into private.game_reconciliation_command_ledger(
    action_id, game_id, command_type, expected_state_version, request_fingerprint, result
  ) values (
    p_action_id, p_game_id, 'finalize_game',
    p_expected_state_version, lower(p_request_fingerprint), v_result
  );

  delete from private.game_reconciliation_claims
  where game_id = p_game_id
    and claim_token = p_claim_token;

  return v_result;
end;
$$;

revoke all on function public.issue_game_reconciler_invocation_internal() from public, anon, authenticated;
revoke all on function public.consume_game_reconciler_invocation_internal(uuid) from public, anon, authenticated;
revoke all on function public.claim_due_games_for_reconciliation_internal(integer, integer) from public, anon, authenticated;
revoke all on function public.release_game_reconciliation_claim_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.load_game_state_for_reconciliation_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.persist_game_state_for_reconciliation_internal(uuid, uuid, uuid, text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.finalize_game_for_reconciliation_internal(uuid, uuid, uuid, bigint, text, jsonb) from public, anon, authenticated;

grant execute on function public.issue_game_reconciler_invocation_internal() to service_role;
grant execute on function public.consume_game_reconciler_invocation_internal(uuid) to service_role;
grant execute on function public.claim_due_games_for_reconciliation_internal(integer, integer) to service_role;
grant execute on function public.release_game_reconciliation_claim_internal(uuid, uuid) to service_role;
grant execute on function public.load_game_state_for_reconciliation_internal(uuid, uuid) to service_role;
grant execute on function public.persist_game_state_for_reconciliation_internal(uuid, uuid, uuid, text, bigint, text, jsonb) to service_role;
grant execute on function public.finalize_game_for_reconciliation_internal(uuid, uuid, uuid, bigint, text, jsonb) to service_role;
