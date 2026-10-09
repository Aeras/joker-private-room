-- Voice remains restricted to the authenticated owner ID. AI chooses text only.
-- Existing room/game policy values stay intact; no active game is rewritten.

alter table public.rooms
  drop constraint if exists rooms_dialogue_settings_check;

alter table public.rooms
  add constraint rooms_dialogue_settings_check check (
    dialogue_intensity in ('conservative', 'normal', 'chaos')
    and (bots_talk or (not allow_profanity and not ai_enabled and not tts_enabled))
    and (not tts_enabled or bots_talk)
    and (tts_enabled or show_dialogue_text)
  );

alter table public.games
  drop constraint if exists games_dialogue_policy_check;

alter table public.games
  add constraint games_dialogue_policy_check check (
    jsonb_typeof(dialogue_policy) = 'object'
    and dialogue_policy ? 'policyVersion'
    and dialogue_policy ? 'speechEnabled'
    and dialogue_policy ? 'allowProfanity'
    and dialogue_policy ? 'aiEnabled'
    and dialogue_policy ? 'ttsEnabled'
    and dialogue_policy ? 'showDialogueText'
    and dialogue_policy ? 'intensity'
    and dialogue_policy->>'policyVersion' = 'dialogue-policy-v1'
    and jsonb_typeof(dialogue_policy->'speechEnabled') = 'boolean'
    and jsonb_typeof(dialogue_policy->'allowProfanity') = 'boolean'
    and jsonb_typeof(dialogue_policy->'aiEnabled') = 'boolean'
    and jsonb_typeof(dialogue_policy->'ttsEnabled') = 'boolean'
    and jsonb_typeof(dialogue_policy->'showDialogueText') = 'boolean'
    and dialogue_policy->>'intensity' in ('conservative', 'normal', 'chaos')
    and (
      (dialogue_policy->>'speechEnabled')::boolean
      or (
        not (dialogue_policy->>'allowProfanity')::boolean
        and not (dialogue_policy->>'aiEnabled')::boolean
        and not (dialogue_policy->>'ttsEnabled')::boolean
      )
    )
    and (
      not (dialogue_policy->>'ttsEnabled')::boolean
      or (
        (dialogue_policy->>'speechEnabled')::boolean
      )
    )
    and (
      (dialogue_policy->>'ttsEnabled')::boolean
      or (dialogue_policy->>'showDialogueText')::boolean
    )
  );

create or replace function private.snapshot_game_dialogue_policy_internal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room
  from public.rooms
  where id = new.room_id;

  if not found then
    raise exception 'ROOM_NOT_FOUND_FOR_DIALOGUE_POLICY';
  end if;

  new.dialogue_policy := jsonb_build_object(
    'policyVersion', 'dialogue-policy-v1',
    'speechEnabled', v_room.bots_talk,
    'allowProfanity', case when v_room.bots_talk then v_room.allow_profanity else false end,
    'aiEnabled', case when v_room.bots_talk then v_room.ai_enabled else false end,
    'ttsEnabled', case when v_room.bots_talk then v_room.tts_enabled else false end,
    'showDialogueText', case when v_room.tts_enabled then v_room.show_dialogue_text else true end,
    'intensity', v_room.dialogue_intensity
  );

  return new;
end;
$$;

create or replace function public.create_room_internal(
  p_session_token text,
  p_action_id uuid,
  p_ruleset_id text,
  p_bots_talk boolean,
  p_allow_profanity boolean,
  p_ai_enabled boolean,
  p_tts_enabled boolean,
  p_show_dialogue_text boolean,
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
$$;

revoke all on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, boolean, boolean, text)
  to service_role;

