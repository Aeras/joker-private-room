create table if not exists public.game_history (
  game_id uuid primary key references public.games(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  completed_at timestamptz not null default now(),
  ruleset_id text not null,
  rules_version text not null,
  state_schema_version integer not null,
  participants jsonb not null,
  constraint game_history_participants_array_check check (
    jsonb_typeof(participants) = 'array' and jsonb_array_length(participants) = 4
  )
);

alter table public.game_history enable row level security;
revoke all on public.game_history from public, anon, authenticated;
grant all on public.game_history to service_role;

create or replace function public.finalize_game_internal(
  p_session_token text,
  p_game_id uuid,
  p_action_id uuid,
  p_expected_state_version bigint,
  p_request_fingerprint text,
  p_new_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
declare
  v_player_id uuid;
  v_game public.games%rowtype;
  v_existing private.game_command_ledger%rowtype;
  v_next_version bigint;
  v_result jsonb;
  v_participants jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
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
  from private.game_command_ledger l
  where l.actor_player_id = v_player_id
    and l.action_id = p_action_id;

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

  insert into public.game_history (
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

  insert into private.game_command_ledger (
    actor_player_id, action_id, game_id, command_type,
    expected_state_version, request_fingerprint, result
  ) values (
    v_player_id, p_action_id, p_game_id, 'finalize_game',
    p_expected_state_version, lower(p_request_fingerprint), v_result
  );

  return v_result;
end;
$$;

revoke all on function public.finalize_game_internal(text, uuid, uuid, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_game_internal(text, uuid, uuid, bigint, text, jsonb)
  to service_role;

create or replace function public.get_game_history_internal(
  p_session_token text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_limit integer;
  v_history jsonb;
  v_stats jsonb;
  v_bot_stats jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  select coalesce(jsonb_agg(item order by completed_at desc), '[]'::jsonb)
  into v_history
  from (
    select h.completed_at,
      jsonb_build_object(
        'gameId', h.game_id,
        'completedAt', h.completed_at,
        'rulesetId', h.ruleset_id,
        'rulesVersion', h.rules_version,
        'participants', h.participants
      ) as item
    from public.game_history h
    where exists (
      select 1 from public.game_participants gp
      where gp.game_id = h.game_id and gp.player_id = v_player_id and gp.status = 'completed'
    )
    order by h.completed_at desc
    limit v_limit
  ) q;

  select jsonb_build_object(
    'totalGames', count(*),
    'firstPlaceCount', count(*) filter (where final_placement = 1),
    'secondPlaceCount', count(*) filter (where final_placement = 2),
    'thirdPlaceCount', count(*) filter (where final_placement = 3),
    'fourthPlaceCount', count(*) filter (where final_placement = 4),
    'winPercentage', null
  ) into v_stats
  from public.game_participants
  where owner_type = 'human' and player_id = v_player_id and status = 'completed';

  select coalesce(jsonb_agg(stat order by bot_id), '[]'::jsonb)
  into v_bot_stats
  from (
    select bot_id,
      jsonb_build_object(
        'botId', bot_id,
        'displayName', max(bot_display_name),
        'totalGames', count(*),
        'firstPlaceCount', count(*) filter (where final_placement = 1),
        'secondPlaceCount', count(*) filter (where final_placement = 2),
        'thirdPlaceCount', count(*) filter (where final_placement = 3),
        'fourthPlaceCount', count(*) filter (where final_placement = 4),
        'winPercentage', null
      ) as stat
    from public.game_participants
    where owner_type = 'bot' and status = 'completed' and bot_id is not null
    group by bot_id
  ) b;

  return jsonb_build_object(
    'ok', true,
    'history', v_history,
    'stats', v_stats,
    'botStats', v_bot_stats
  );
end;
$$;

revoke all on function public.get_game_history_internal(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_game_history_internal(text, integer)
  to service_role;
