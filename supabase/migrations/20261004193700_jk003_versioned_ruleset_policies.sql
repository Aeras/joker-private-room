-- JK-003: immutable versioned policies; existing Popular rows remain untouched.
begin;
alter table public.rooms drop constraint rooms_ruleset_id_check;
alter table public.games drop constraint games_ruleset_id_check;
alter table public.rooms add constraint rooms_ruleset_id_check check ((ruleset_id, rules_version) in (('popular','popular-v1'),('classic','classic-v1'),('minus','minus-v1'),('panagiotis','panagiotis-v1')));
alter table public.games add constraint games_ruleset_id_check check ((ruleset_id, rules_version) in (('popular','popular-v1'),('classic','classic-v1'),('minus','minus-v1'),('panagiotis','panagiotis-v1')));
CREATE OR REPLACE FUNCTION public.create_room_internal(p_session_token text, p_action_id uuid, p_ruleset_id text, p_bots_talk boolean, p_allow_profanity boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_player_id uuid;
  v_is_host boolean;
  v_fingerprint text;
  v_existing private.room_command_ledger%rowtype;
  v_active jsonb;
  v_room_id uuid;
  v_code text;
begin
  select v.id, v.is_host into v_player_id, v_is_host
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not coalesce(v_is_host, false) then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;
  if p_ruleset_id is null or p_ruleset_id not in ('popular', 'classic', 'minus', 'panagiotis') then
    return jsonb_build_object('ok', false, 'code', 'RULESET_NOT_IMPLEMENTED');
  end if;
  if p_ruleset_id = 'panagiotis' and v_player_id <> 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;
  if p_allow_profanity and not p_bots_talk then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|','create_room',p_ruleset_id,p_bots_talk::text,p_allow_profanity::text), 'sha256'), 'hex');

  select * into v_existing from private.room_command_ledger
  where player_id = v_player_id and action_id = p_action_id;
  if found then
    if v_existing.command_type <> 'create_room' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id)
    );
  end if;

  v_active := private.active_game_for_player_internal(v_player_id);
  if v_active is not null then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS', 'activeGame', v_active);
  end if;

  v_code := private.generate_room_code_internal();
  insert into public.rooms(code, host_player_id, ruleset_id, rules_version, bots_talk, allow_profanity)
  values (v_code, v_player_id, p_ruleset_id, p_ruleset_id || '-v1', p_bots_talk, p_allow_profanity)
  returning id into v_room_id;

  insert into public.room_seats(room_id, seat_index, occupant_type, player_id, connected)
  values
    (v_room_id, 0, 'human', v_player_id, true),
    (v_room_id, 1, 'empty', null, false),
    (v_room_id, 2, 'empty', null, false),
    (v_room_id, 3, 'empty', null, false);

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (v_player_id, p_action_id, 'create_room', v_fingerprint, jsonb_build_object('roomId', v_room_id, 'roomCode', v_code));

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room_id, v_player_id));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_room_internal(p_session_token text, p_action_id uuid, p_ruleset_id text, p_bots_talk boolean, p_allow_profanity boolean, p_ai_enabled boolean, p_dialogue_intensity text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_player_id uuid;
  v_is_host boolean;
  v_fingerprint text;
  v_existing private.room_command_ledger%rowtype;
  v_active jsonb;
  v_room_id uuid;
  v_code text;
begin
  select v.id, v.is_host into v_player_id, v_is_host
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not coalesce(v_is_host, false) then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;
  if p_ruleset_id is null or p_ruleset_id not in ('popular', 'classic', 'minus', 'panagiotis') then
    return jsonb_build_object('ok', false, 'code', 'RULESET_NOT_IMPLEMENTED');
  end if;
  if p_ruleset_id = 'panagiotis' and v_player_id <> 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;
  if p_dialogue_intensity not in ('conservative', 'normal', 'chaos') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;
  if (p_allow_profanity or p_ai_enabled) and not p_bots_talk then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|',
    'create_room', p_ruleset_id, p_bots_talk::text, p_allow_profanity::text,
    p_ai_enabled::text, p_dialogue_intensity
  ), 'sha256'), 'hex');

  select * into v_existing
  from private.room_command_ledger
  where player_id = v_player_id and action_id = p_action_id;

  if found then
    if v_existing.command_type <> 'create_room' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id)
    );
  end if;

  v_active := private.active_game_for_player_internal(v_player_id);
  if v_active is not null then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS', 'activeGame', v_active);
  end if;

  v_code := private.generate_room_code_internal();
  insert into public.rooms(
    code, host_player_id, ruleset_id, rules_version,
    bots_talk, allow_profanity, ai_enabled, dialogue_intensity
  )
  values (
    v_code, v_player_id, p_ruleset_id, p_ruleset_id || '-v1',
    p_bots_talk, p_allow_profanity, p_ai_enabled, p_dialogue_intensity
  )
  returning id into v_room_id;

  insert into public.room_seats(room_id, seat_index, occupant_type, player_id, connected)
  values
    (v_room_id, 0, 'human', v_player_id, true),
    (v_room_id, 1, 'empty', null, false),
    (v_room_id, 2, 'empty', null, false),
    (v_room_id, 3, 'empty', null, false);

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (
    v_player_id,
    p_action_id,
    'create_room',
    v_fingerprint,
    jsonb_build_object('roomId', v_room_id, 'roomCode', v_code)
  );

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room_id, v_player_id));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.start_room_internal(p_session_token text, p_action_id uuid, p_code text, p_expected_room_version bigint, p_ordered_bot_catalog jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_player_id uuid;
  v_fingerprint text;
  v_existing private.room_command_ledger%rowtype;
  v_room public.rooms%rowtype;
  v_active jsonb;
  v_game_id uuid;
  v_seat record;
  v_catalog_version text;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  if p_action_id is null
     or p_expected_room_version is null
     or p_expected_room_version < 0
     or jsonb_typeof(p_ordered_bot_catalog) is distinct from 'array'
     or jsonb_array_length(p_ordered_bot_catalog) <> 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_ordered_bot_catalog) item
    where coalesce(item->>'id', '') = ''
       or coalesce(item->>'displayName', '') = ''
       or coalesce(item->>'avatarUrl', '') = ''
       or coalesce(item->>'personalityId', '') = ''
       or coalesce(item->>'strategyProfileId', '') = ''
       or coalesce(item->>'catalogVersion', '') = ''
       or coalesce(item->>'rulesVersion', '') = ''
  ) or (
    select count(distinct item->>'id')
    from jsonb_array_elements(p_ordered_bot_catalog) item
  ) <> 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  select item->>'catalogVersion' into v_catalog_version
  from jsonb_array_elements(p_ordered_bot_catalog) item
  limit 1;

  if exists (
    select 1 from jsonb_array_elements(p_ordered_bot_catalog) item
    where item->>'catalogVersion' is distinct from v_catalog_version
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|',
    'start_game', upper(trim(p_code)), p_expected_room_version::text,
    p_ordered_bot_catalog::text
  ), 'sha256'), 'hex');

  select * into v_existing
  from private.room_command_ledger
  where player_id = v_player_id and action_id = p_action_id;

  if found then
    if v_existing.command_type <> 'start_game' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'gameId', v_existing.result->>'gameId',
      'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id)
    );
  end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id <> v_player_id then return jsonb_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'ROOM_ALREADY_STARTED'); end if;
  if v_room.room_version <> p_expected_room_version then return jsonb_build_object('ok', false, 'code', 'STALE_ROOM_VERSION'); end if;
  if v_room.bot_catalog_version <> v_catalog_version then return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE'); end if;
  if exists (
    select 1 from jsonb_array_elements(p_ordered_bot_catalog) item
    where item->>'rulesVersion' is distinct from 'popular-v1'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  perform seat_index
  from public.room_seats
  where room_id = v_room.id
  order by seat_index
  for update;

  if (select count(*) from public.room_seats where room_id = v_room.id) <> 4 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  if exists (
    select 1
    from public.room_seats s
    where s.room_id = v_room.id
      and s.occupant_type = 'bot'
      and not exists (
        select 1
        from jsonb_array_elements(p_ordered_bot_catalog) item
        where item->>'id' = s.bot_id
          and item->>'displayName' = s.bot_display_name
          and item->>'avatarUrl' = s.bot_avatar_url
          and item->>'personalityId' = s.bot_personality_id
          and item->>'strategyProfileId' = s.bot_strategy_profile_id
          and item->>'catalogVersion' = s.bot_catalog_version
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  for v_seat in
    select player_id
    from public.room_seats
    where room_id = v_room.id and occupant_type = 'human'
    order by seat_index
  loop
    v_active := private.active_game_for_player_internal(v_seat.player_id);
    if v_active is not null then
      return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS', 'activeGame', v_active);
    end if;
  end loop;

  with available as (
    select
      item.value,
      row_number() over (order by item.ordinality) as rn
    from jsonb_array_elements(p_ordered_bot_catalog) with ordinality as item(value, ordinality)
    where not exists (
      select 1
      from public.room_seats used
      where used.room_id = v_room.id
        and used.occupant_type = 'bot'
        and used.bot_id = item.value->>'id'
    )
  ), empty_seats as (
    select
      seat_index,
      row_number() over (order by seat_index) as rn
    from public.room_seats
    where room_id = v_room.id and occupant_type = 'empty'
  ), assignments as (
    select e.seat_index, a.value
    from empty_seats e
    join available a using (rn)
  )
  update public.room_seats s
  set occupant_type = 'bot',
      connected = false,
      player_id = null,
      bot_id = a.value->>'id',
      bot_display_name = a.value->>'displayName',
      bot_avatar_url = a.value->>'avatarUrl',
      bot_personality_id = a.value->>'personalityId',
      bot_strategy_profile_id = a.value->>'strategyProfileId',
      bot_catalog_version = a.value->>'catalogVersion'
  from assignments a
  where s.room_id = v_room.id and s.seat_index = a.seat_index;

  if exists (
    select 1 from public.room_seats
    where room_id = v_room.id and occupant_type = 'empty'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  insert into public.games(
    room_id, ruleset_id, rules_version, state_schema_version,
    state_version, lifecycle, bot_catalog_version
  ) values (
    v_room.id, v_room.ruleset_id, v_room.rules_version, 4,
    0, 'starting', v_room.bot_catalog_version
  ) returning id into v_game_id;

  begin
    insert into public.game_participants(
      game_id, seat_index, owner_type, player_id,
      bot_id, bot_display_name, bot_avatar_url, bot_personality_id,
      bot_strategy_profile_id, bot_catalog_version, status
    )
    select
      v_game_id,
      seat_index,
      case when occupant_type = 'human' then 'human' else 'bot' end,
      player_id,
      bot_id,
      bot_display_name,
      bot_avatar_url,
      bot_personality_id,
      bot_strategy_profile_id,
      bot_catalog_version,
      'active'
    from public.room_seats
    where room_id = v_room.id
    order by seat_index;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'ACTIVE_GAME_EXISTS';
  end;

  update public.rooms
  set status = 'playing',
      current_game_id = v_game_id,
      room_version = room_version + 1,
      started_at = now(),
      updated_at = now()
  where id = v_room.id;

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (
    v_player_id,
    p_action_id,
    'start_game',
    v_fingerprint,
    jsonb_build_object(
      'roomId', v_room.id,
      'roomCode', v_room.code,
      'gameId', v_game_id,
      'botCatalogVersion', v_room.bot_catalog_version,
      'roster', (
        select jsonb_agg(jsonb_build_object(
          'seatIndex', s.seat_index,
          'occupantType', s.occupant_type,
          'playerId', s.player_id,
          'botId', s.bot_id,
          'strategyProfileId', s.bot_strategy_profile_id
        ) order by s.seat_index)
        from public.room_seats s
        where s.room_id = v_room.id
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'gameId', v_game_id,
    'room', private.room_projection_internal(v_room.id, v_player_id)
  );
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_game_history_internal(p_session_token text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
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
        'rulesetId', case when h.ruleset_id = 'panagiotis' and v_player_id is distinct from 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then 'popular' else h.ruleset_id end,
        'rulesVersion', case when h.ruleset_id = 'panagiotis' and v_player_id is distinct from 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then 'popular-v1' else h.rules_version end,
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
$function$
;
CREATE OR REPLACE FUNCTION private.room_projection_internal(p_room_id uuid, p_viewer_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'code', r.code,
    'hostId', r.host_player_id,
    'rulesetId', case when r.ruleset_id = 'panagiotis' and p_viewer_id is distinct from 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then 'popular' else r.ruleset_id end,
    'rulesetName', case when r.ruleset_id = 'panagiotis' and p_viewer_id = 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then 'Panagiotis Special 😈' when r.ruleset_id = 'classic' then 'Κλασικό Τζόκερ' when r.ruleset_id = 'minus' then 'Minus' else 'Popular — Our Rules' end,
    'botCatalogVersion', r.bot_catalog_version,
    'botSettings', jsonb_build_object(
      'botsTalk', r.bots_talk,
      'allowProfanity', r.allow_profanity,
      'aiEnabled', r.ai_enabled,
      'intensity', r.dialogue_intensity
    ),
    'status', r.status,
    'version', r.room_version,
    'gameId', r.current_game_id,
    'seats', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'index', s.seat_index,
          'occupant', case
            when s.occupant_type = 'empty' then jsonb_build_object('type','empty')
            when s.occupant_type = 'human' then jsonb_build_object(
              'type','human',
              'player', jsonb_build_object(
                'id', p.id,
                'displayName', p.display_name,
                'role', case when p.id = r.host_player_id then 'host' else 'player' end
              ),
              'connected', s.connected
            )
            else jsonb_build_object(
              'type','bot',
              'bot', jsonb_build_object(
                'id', s.bot_id,
                'displayName', s.bot_display_name,
                'avatarUrl', s.bot_avatar_url,
                'personalityId', s.bot_personality_id,
                'strategyProfileId', s.bot_strategy_profile_id,
                'catalogVersion', s.bot_catalog_version
              )
            )
          end
        ) order by s.seat_index
      )
      from public.room_seats s
      left join public.players p on p.id = s.player_id
      where s.room_id = r.id
    ), '[]'::jsonb)
  )
  from public.rooms r
  where r.id = p_room_id
    and exists (
      select 1 from public.room_seats mine
      where mine.room_id = r.id
        and mine.occupant_type = 'human'
        and mine.player_id = p_viewer_id
    );
$function$
;

create or replace function public.get_available_rulesets_internal(p_session_token text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_player_id uuid; v_is_host boolean; v_options jsonb;
begin
 select id, is_host into v_player_id, v_is_host from public.validate_player_session_internal(p_session_token) limit 1;
 if v_player_id is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
 if not coalesce(v_is_host,false) then return jsonb_build_object('ok',false,'code','NOT_HOST'); end if;
 v_options := '[{"id":"popular","name":"Popular — Our Rules","description":"Η βασική έκδοση που παίζουμε συνήθως."},{"id":"classic","name":"Κλασικό Τζόκερ","description":"38 φύλλα και αυτόματη αποκάλυψη ατού σε κάθε μοίρασμα."},{"id":"minus","name":"Minus","description":"−100 βαθμοί για κάθε μπάζα που λείπει από τη δήλωση."}]'::jsonb;
 if v_player_id = 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
  v_options := v_options || '[{"id":"panagiotis","name":"Panagiotis Special 😈","description":"Ειδική παραλλαγή."}]'::jsonb;
 end if;
 return jsonb_build_object('ok',true,'options',v_options);
end $$;
revoke all on function public.get_available_rulesets_internal(text) from public, anon, authenticated;
grant execute on function public.get_available_rulesets_internal(text) to service_role;

create or replace function private.protect_ruleset_identity_internal()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
 if (new.ruleset_id, new.rules_version) is distinct from (old.ruleset_id, old.rules_version) then
  raise exception 'Ruleset identity is immutable';
 end if;
 return new;
end $$;
revoke all on function private.protect_ruleset_identity_internal() from public, anon, authenticated;
create trigger games_immutable_ruleset before update of ruleset_id, rules_version on public.games for each row execute function private.protect_ruleset_identity_internal();
create trigger rooms_immutable_ruleset before update of ruleset_id, rules_version on public.rooms for each row execute function private.protect_ruleset_identity_internal();

-- Reject corrupted schema-v4 policy snapshots at the persistence boundary too.
create or replace function private.validate_ruleset_snapshot_internal()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $
declare s jsonb := new.canonical_state; deck jsonb; card jsonb; target text; present boolean; unused text;
begin
 if s is null or new.state_schema_version <> 4 then return new; end if;
 if s->>'rulesetId' is distinct from new.ruleset_id or s->>'rulesVersion' is distinct from new.rules_version or s->>'stateSchemaVersion' is distinct from '4' then raise exception 'Invalid ruleset snapshot identity'; end if;
 deck := s#>'{cards,deck}';
 if jsonb_typeof(deck) is distinct from 'array' then raise exception 'Invalid policy deck'; end if;
 if s#>>'{progression,phase}' = 'INITIAL_DEALER_SELECTION' then
  if jsonb_array_length(deck) <> 0 then raise exception 'Starting deck must be empty'; end if;
 else
  if jsonb_array_length(deck) <> case when new.ruleset_id = 'classic' then 38 else 36 end or (select count(distinct value->>'id') from jsonb_array_elements(deck)) <> jsonb_array_length(deck) then raise exception 'Invalid policy deck composition'; end if;
  for card in select value from jsonb_array_elements(deck) loop
   if card->>'kind' = 'joker' then
    if card->>'id' not in ('joker-1','joker-2') then raise exception 'Invalid Joker'; end if;
   elsif card->>'kind' = 'standard' then
    if coalesce(card->>'suit','') not in ('spades','hearts','diamonds','clubs') or coalesce(card->>'rank','') not in ('6','7','8','9','10','J','Q','K','A') or card->>'id' is distinct from (card->>'rank') || '-' || (card->>'suit') or (new.ruleset_id <> 'classic' and card->>'rank' = '6' and card->>'suit' in ('spades','clubs')) then raise exception 'Card outside selected deck'; end if;
   else raise exception 'Invalid card shape'; end if;
  end loop;
 end if;
 if new.ruleset_id = 'panagiotis' then
  if jsonb_typeof(s->'privateRulesetState') is distinct from 'object' or not (s->'privateRulesetState' ? 'targetPlayerId') then raise exception 'Missing frozen target'; end if;
  target := s#>>'{privateRulesetState,targetPlayerId}';
  select exists(select 1 from public.game_participants where game_id = new.id and owner_type = 'human' and player_id = '12302475-c4da-491c-9081-08c039384ac1'::uuid) into present;
  if (present and target is distinct from '12302475-c4da-491c-9081-08c039384ac1') or (not present and target is not null) then raise exception 'Invalid frozen target identity'; end if;
  if tg_op = 'UPDATE' and old.canonical_state is not null and old.canonical_state->'privateRulesetState' is distinct from s->'privateRulesetState' then raise exception 'Frozen allocation cannot change'; end if;
 end if;
 if new.ruleset_id = 'classic' then
  if coalesce((s#>>'{cards,hiddenPartialNineCardHands}')::boolean,false) or s#>>'{trump,status}' = 'chooser_pending' or s#>>'{progression,phase}' = 'NINE_CARD_TRUMP_CHOICE' then raise exception 'Classic cannot choose trump'; end if;
  if s#>>'{progression,cardsPerPlayer}' = '9' then
   if s#>'{cards,exposedTrumpCard}' is distinct from deck->36 then raise exception 'Classic must reveal card 37'; end if;
   unused := deck->37->>'id';
   if exists(select 1 from (
    select value from jsonb_path_query(s,'$.cards.hands[*][*]') value
    union all select value from jsonb_path_query(s,'$.cards.currentTrick[*].card') value
    union all select value from jsonb_path_query(s,'$.cards.completedTricks[*].cards[*].card') value
   ) live where live.value->>'id' = unused) then raise exception 'Classic unused card entered play'; end if;
  end if;
 end if;
 return new;
end $;
revoke all on function private.validate_ruleset_snapshot_internal() from public, anon, authenticated;
create trigger games_validate_ruleset_snapshot before insert or update of canonical_state on public.games for each row execute function private.validate_ruleset_snapshot_internal();
commit;

