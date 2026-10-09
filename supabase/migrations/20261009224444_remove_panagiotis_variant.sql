-- Retire the removed ruleset without rewriting completed game records.
-- Applied migrations remain immutable. NOT VALID checks grandfather existing
-- historical rows while rejecting every new or updated unsupported identity.
begin;
do $$ begin
 if exists(select 1 from public.games where ruleset_id not in ('popular','classic','minus') and lifecycle <> 'complete')
 or exists(select 1 from public.rooms where ruleset_id not in ('popular','classic','minus') and status = 'lobby')
 or exists(select 1 from private.bot_lab_jobs where config->>'ruleset' not in ('popular','classic','minus') and status in ('queued','running')) then
   raise exception 'Finish unsupported active games, lobbies or Bot Lab jobs before retiring rulesets';
 end if;
end $$;
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
  if p_ruleset_id is null or p_ruleset_id not in ('popular', 'classic', 'minus') then
    return jsonb_build_object('ok', false, 'code', 'RULESET_NOT_IMPLEMENTED');
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
$function$;

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
        'rulesetId', h.ruleset_id,
        'rulesVersion', h.rules_version,
        'participants', h.participants
      ) as item
    from public.game_history h
    where h.ruleset_id in ('popular','classic','minus') and exists (
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
$function$;

CREATE OR REPLACE FUNCTION public.bot_lab_admin_internal(p_session_token text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare player uuid; j private.bot_lab_jobs; cfg jsonb; n integer; rid uuid; target uuid;
begin
 select id into player from public.validate_player_session_internal(p_session_token);
 if player is distinct from 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action='access' then return jsonb_build_object('allowed',true); end if;
 if p_action='list' then
   return jsonb_build_object('jobs',(select coalesce(jsonb_agg(private.bot_lab_job_json(x) order by x.created_at desc),'[]'::jsonb) from (select * from private.bot_lab_jobs where owner_id=player order by created_at desc limit 30) x),'workerEnabled',(select enabled from private.bot_lab_scheduler_config where singleton));
 end if;
 if p_action='create' then
   cfg:=p_payload->'config'; rid:=(p_payload->>'requestId')::uuid;
   if rid is null or jsonb_typeof(cfg) is distinct from 'object' or jsonb_typeof(cfg->'games') is distinct from 'number' or jsonb_typeof(cfg->'seed') is distinct from 'number' or (cfg->>'games')::integer not in (10,100,1000,5000) or (cfg->>'seed')::bigint not between 0 and 4294966045 or cfg->>'ruleset' not in ('popular','classic','minus') or jsonb_typeof(cfg->'compare')<>'boolean' or not (cfg->'lineup'='null'::jsonb or (jsonb_typeof(cfg->'lineup')='array' and jsonb_array_length(cfg->'lineup')=4 and not exists(select 1 from jsonb_array_elements_text(cfg->'lineup') t where t is null or t not in ('strong-basic-v1','memory-inference-v1','probability-simulation-v1'))))
     or not (cfg ?& array['games','seed','ruleset','compare','lineup']) then raise exception 'INVALID_CONFIG'; end if;
   select * into j from private.bot_lab_jobs where request_id=rid;
   if found then if j.config<>cfg then raise exception 'ACTION_ID_CONFLICT'; end if; return private.bot_lab_job_json(j); end if;
   if not exists(select 1 from private.bot_lab_scheduler_config where singleton and enabled) then raise exception 'WORKER_NOT_CONFIGURED'; end if;
   n:=(cfg->>'games')::integer * case when (cfg->>'compare')::boolean then 2 else 1 end;
   insert into private.bot_lab_jobs(owner_id,request_id,config,total_games) values(player,rid,cfg,n) returning * into j;
   perform private.dispatch_bot_lab_internal();
   return private.bot_lab_job_json(j);
 end if;
 target:=(p_payload->>'jobId')::uuid;
 select * into j from private.bot_lab_jobs where id=target and owner_id=player;
 if not found then raise exception 'JOB_NOT_FOUND'; end if;
 if p_action='get' then return private.bot_lab_job_json(j); end if;
 if p_action='cancel' then
   update private.bot_lab_jobs set status='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp(),lease_token=null,lease_until=null where id=target and status in ('queued','running') returning * into j;
   if not found then select * into j from private.bot_lab_jobs where id=target; end if;
   return private.bot_lab_job_json(j);
 end if;
 if p_action='results' then
   n:=coalesce((p_payload->>'offset')::integer,0); if n<0 or n>10000 then raise exception 'INVALID_OFFSET'; end if;
   return jsonb_build_object('results',(select coalesce(jsonb_agg(to_jsonb(x) order by game_index),'[]'::jsonb) from (select game_index,result from private.bot_lab_results where job_id=target and game_index>=n order by game_index limit 20) x));
 end if;
 raise exception 'INVALID_ACTION';
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_ruleset_snapshot_internal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare s jsonb := new.canonical_state; deck jsonb; card jsonb; unused text;
begin
 if s is null or new.state_schema_version <> 4 then return new; end if;
 if s->>'rulesetId' is distinct from new.ruleset_id or s->>'rulesVersion' is distinct from new.rules_version or s->>'stateSchemaVersion' is distinct from '4' then raise exception 'Invalid ruleset snapshot identity'; end if;
 deck := s#>'{cards,deck}';
 if jsonb_typeof(deck) is distinct from 'array' then raise exception 'Invalid policy deck'; end if;
 if s#>>'{progression,phase}' = 'INITIAL_DEALER_SELECTION' then
  if jsonb_array_length(deck) <> 0 then raise exception 'Starting deck must be empty'; end if;
 else
  if jsonb_array_length(deck) <> (case when new.ruleset_id = 'classic' then 38 else 36 end) or (select count(distinct value->>'id') from jsonb_array_elements(deck)) <> jsonb_array_length(deck) then raise exception 'Invalid policy deck composition'; end if;
  for card in select value from jsonb_array_elements(deck) loop
   if card->>'kind' = 'joker' then
    if card->>'id' not in ('joker-1','joker-2') then raise exception 'Invalid Joker'; end if;
   elsif card->>'kind' = 'standard' then
    if coalesce(card->>'suit','') not in ('spades','hearts','diamonds','clubs') or coalesce(card->>'rank','') not in ('6','7','8','9','10','J','Q','K','A') or card->>'id' is distinct from (card->>'rank') || '-' || (card->>'suit') or (new.ruleset_id <> 'classic' and card->>'rank' = '6' and card->>'suit' in ('spades','clubs')) then raise exception 'Card outside selected deck'; end if;
   else raise exception 'Invalid card shape'; end if;
  end loop;
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
end $function$;

CREATE OR REPLACE FUNCTION private.room_projection_internal(p_room_id uuid, p_viewer_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'code', r.code,
    'hostId', r.host_player_id,
    'rulesetId', r.ruleset_id,
    'rulesetName', case when r.ruleset_id = 'classic' then 'Κλασικό Τζόκερ' when r.ruleset_id = 'minus' then 'Minus' else 'Popular — Our Rules' end,
    'botCatalogVersion', r.bot_catalog_version,
    'botSettings', jsonb_build_object(
      'botsTalk', r.bots_talk,
      'allowProfanity', r.allow_profanity,
      'aiEnabled', r.ai_enabled,
      'ttsEnabled', r.tts_enabled,
      'showDialogueText', r.show_dialogue_text,
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
  where r.id = p_room_id and r.ruleset_id in ('popular','classic','minus')
    and exists (
      select 1 from public.room_seats mine
      where mine.room_id = r.id
        and mine.occupant_type = 'human'
        and mine.player_id = p_viewer_id
    );
$function$;

CREATE OR REPLACE FUNCTION public.get_available_rulesets_internal(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_player_id uuid;
  v_options jsonb;
begin
  select id into v_player_id
  from public.validate_player_session_internal(p_session_token)
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if v_player_id not in (
    '12302475-c4da-491c-9081-08c039384ac1'::uuid,
    'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid,
    '61208d95-f090-4290-8e0f-b1f9de40f84f'::uuid
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;

  v_options := '[
    {"id":"popular","name":"Popular — Our Rules","description":"Η βασική έκδοση που παίζουμε συνήθως."},
    {"id":"classic","name":"Κλασικό Τζόκερ","description":"38 φύλλα και αυτόματη αποκάλυψη ατού σε κάθε μοίρασμα."},
    {"id":"minus","name":"Minus","description":"−100 βαθμοί για κάθε μπάζα που λείπει από τη δήλωση."}
  ]'::jsonb;


  return jsonb_build_object('ok', true, 'options', v_options);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_room_internal(p_session_token text, p_action_id uuid, p_ruleset_id text, p_bots_talk boolean, p_allow_profanity boolean, p_ai_enabled boolean, p_tts_enabled boolean, p_show_dialogue_text boolean, p_dialogue_intensity text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_player_id uuid;
  v_fingerprint text;
  v_existing private.room_command_ledger%rowtype;
  v_active jsonb;
  v_room_id uuid;
  v_code text;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if v_player_id not in (
    '12302475-c4da-491c-9081-08c039384ac1'::uuid,
    'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid,
    '61208d95-f090-4290-8e0f-b1f9de40f84f'::uuid
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;

  if p_ruleset_id is null or p_ruleset_id not in ('popular', 'classic', 'minus') then
    return jsonb_build_object('ok', false, 'code', 'RULESET_NOT_IMPLEMENTED');
  end if;


  if (p_ai_enabled or p_tts_enabled)
     and v_player_id <> 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;

  if p_dialogue_intensity not in ('conservative', 'normal', 'chaos') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  if (p_allow_profanity or p_ai_enabled or p_tts_enabled) and not p_bots_talk then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  if not p_tts_enabled and not p_show_dialogue_text then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|',
    'create_room', p_ruleset_id, p_bots_talk::text, p_allow_profanity::text,
    p_ai_enabled::text, p_tts_enabled::text, p_show_dialogue_text::text, p_dialogue_intensity
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
    bots_talk, allow_profanity, ai_enabled, tts_enabled, show_dialogue_text, dialogue_intensity
  )
  values (
    v_code, v_player_id, p_ruleset_id, p_ruleset_id || '-v1',
    p_bots_talk, p_allow_profanity, p_ai_enabled, p_tts_enabled, p_show_dialogue_text, p_dialogue_intensity
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

  return jsonb_build_object(
    'ok', true,
    'room', private.room_projection_internal(v_room_id, v_player_id)
  );
end;
$function$;

alter table public.rooms drop constraint rooms_ruleset_id_check;
alter table public.rooms add constraint rooms_ruleset_id_check check ((ruleset_id,rules_version) in (('popular','popular-v1'),('classic','classic-v1'),('minus','minus-v1'))) not valid;
alter table public.games drop constraint games_ruleset_id_check;
alter table public.games add constraint games_ruleset_id_check check ((ruleset_id,rules_version) in (('popular','popular-v1'),('classic','classic-v1'),('minus','minus-v1'))) not valid;
revoke all on function public.create_room_internal(text,uuid,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.create_room_internal(text,uuid,text,boolean,boolean) to service_role;

revoke all on function public.get_game_history_internal(text,integer) from public,anon,authenticated;
grant execute on function public.get_game_history_internal(text,integer) to service_role;

revoke all on function public.bot_lab_admin_internal(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.bot_lab_admin_internal(text,text,jsonb) to service_role;

revoke all on function private.validate_ruleset_snapshot_internal() from public,anon,authenticated;

revoke all on function private.room_projection_internal(uuid,uuid) from public,anon,authenticated;

revoke all on function public.get_available_rulesets_internal(text) from public,anon,authenticated;
grant execute on function public.get_available_rulesets_internal(text) to service_role;

revoke all on function public.create_room_internal(text,uuid,text,boolean,boolean,boolean,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.create_room_internal(text,uuid,text,boolean,boolean,boolean,boolean,boolean,text) to service_role;
-- Superseded by the voice-independent nine-argument RPC (already absent in production).
drop function if exists public.create_room_internal(text,uuid,text,boolean,boolean,boolean,text);
commit;
