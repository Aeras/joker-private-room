create or replace function public.get_available_rulesets_internal(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
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

  if v_player_id = 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
    v_options := v_options || '[
      {"id":"panagiotis","name":"Panagiotis Special 😈","description":"Ειδική παραλλαγή."}
    ]'::jsonb;
  end if;

  return jsonb_build_object('ok', true, 'options', v_options);
end;
$$;

revoke all on function public.get_available_rulesets_internal(text)
  from public, anon, authenticated;
grant execute on function public.get_available_rulesets_internal(text)
  to service_role;

create or replace function public.create_room_internal(
  p_session_token text,
  p_action_id uuid,
  p_ruleset_id text,
  p_bots_talk boolean,
  p_allow_profanity boolean,
  p_ai_enabled boolean,
  p_dialogue_intensity text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $$
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

  if p_ruleset_id is null or p_ruleset_id not in ('popular', 'classic', 'minus', 'panagiotis') then
    return jsonb_build_object('ok', false, 'code', 'RULESET_NOT_IMPLEMENTED');
  end if;

  if p_ruleset_id = 'panagiotis'
     and v_player_id <> 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
    return jsonb_build_object('ok', false, 'code', 'NOT_HOST');
  end if;

  if p_ai_enabled
     and v_player_id <> 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then
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

  return jsonb_build_object(
    'ok', true,
    'room', private.room_projection_internal(v_room_id, v_player_id)
  );
end;
$$;

revoke all on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, text)
  to service_role;
