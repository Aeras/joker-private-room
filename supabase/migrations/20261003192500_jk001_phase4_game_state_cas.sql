alter table public.games
  add column if not exists canonical_state jsonb;

alter table public.games
  drop constraint if exists games_canonical_state_object_check;

alter table public.games
  add constraint games_canonical_state_object_check
  check (canonical_state is null or jsonb_typeof(canonical_state) = 'object');

create table if not exists private.game_command_ledger (
  actor_player_id uuid not null references public.players(id) on delete cascade,
  action_id uuid not null,
  game_id uuid not null references public.games(id) on delete cascade,
  command_type text not null check (command_type ~ '^[a-z0-9_]{1,64}$'),
  expected_state_version bigint not null check (expected_state_version >= 0),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_player_id, action_id)
);

revoke all on private.game_command_ledger from public, anon, authenticated;
grant all on private.game_command_ledger to service_role;

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
  v_game public.games%rowtype;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select g.* into v_game
  from public.games g
  where g.id = p_game_id
    and exists (
      select 1
      from public.game_participants gp
      where gp.game_id = g.id
        and gp.owner_type = 'human'
        and gp.player_id = v_player_id
        and gp.status = 'active'
    );

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

create or replace function public.persist_game_state_internal(
  p_session_token text,
  p_game_id uuid,
  p_action_id uuid,
  p_command_type text,
  p_expected_state_version bigint,
  p_request_fingerprint text,
  p_new_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_player_id uuid;
  v_game public.games%rowtype;
  v_existing private.game_command_ledger%rowtype;
  v_next_version bigint;
  v_new_lifecycle text;
  v_result jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
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

  select g.* into v_game
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.game_id = v_game.id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  select * into v_existing
  from private.game_command_ledger l
  where l.actor_player_id = v_player_id
    and l.action_id = p_action_id;

  if found then
    if v_existing.game_id = p_game_id
       and v_existing.command_type = p_command_type
       and v_existing.expected_state_version = p_expected_state_version
       and v_existing.request_fingerprint = lower(p_request_fingerprint) then
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
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

  v_result := jsonb_build_object(
    'ok', true,
    'gameId', v_game.id,
    'stateVersion', v_next_version,
    'lifecycle', v_new_lifecycle,
    'replayed', false
  );

  insert into private.game_command_ledger (
    actor_player_id,
    action_id,
    game_id,
    command_type,
    expected_state_version,
    request_fingerprint,
    result
  ) values (
    v_player_id,
    p_action_id,
    p_game_id,
    p_command_type,
    p_expected_state_version,
    lower(p_request_fingerprint),
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.persist_game_state_internal(text, uuid, uuid, text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_game_state_internal(text, uuid, uuid, text, bigint, text, jsonb)
  to service_role;
