-- JK-006: explicit human-to-bot messages keep the existing shared provider
-- budget/concurrency and human-message rate limit, but are not rejected merely
-- because automatic table banter recently used the room/speaker cooldown.

create or replace function public.claim_dialogue_event_internal(
  p_session_token text,
  p_game_id uuid,
  p_event_id text,
  p_event_type text,
  p_speaker_bot_id text,
  p_reply_depth smallint,
  p_is_human_message boolean,
  p_event_created_at timestamptz,
  p_provider_call boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_policy jsonb;
  v_intensity text;
  v_call_limit integer;
  v_cooldown_seconds integer;
  v_window_started_at timestamptz;
  v_window_ai_calls integer;
  v_total_ai_calls integer;
  v_global_cooldown_until timestamptz;
  v_active_generation_until timestamptz;
  v_speaker_cooldowns jsonb;
  v_human_window_started_at timestamptz;
  v_human_messages_in_window integer;
  v_speaker_until_text text;
  v_now timestamptz := now();
  v_lease_until timestamptz;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if p_event_id is null
     or char_length(p_event_id) not between 1 and 128
     or p_event_type is null
     or char_length(p_event_type) not between 1 and 64
     or p_speaker_bot_id is null
     or char_length(p_speaker_bot_id) not between 1 and 64
     or p_reply_depth not between 0 and 1
     or p_event_created_at is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
  end if;

  select g.dialogue_policy into v_policy
  from public.games g
  join public.game_participants gp on gp.game_id = g.id
  where g.id = p_game_id
    and gp.owner_type = 'human'
    and gp.player_id = v_player_id
    and gp.status in ('active', 'completed')
  limit 1;

  if v_policy is null then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;
  if not coalesce((v_policy->>'speechEnabled')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_DISABLED');
  end if;
  if p_provider_call and not coalesce((v_policy->>'aiEnabled')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'AI_DISABLED');
  end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'bot'
      and gp.bot_id = p_speaker_bot_id
      and gp.status in ('active', 'completed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_TARGET');
  end if;

  if p_event_created_at < v_now - interval '30 seconds'
     or p_event_created_at > v_now + interval '5 seconds' then
    return jsonb_build_object('ok', false, 'code', 'STALE_DIALOGUE_EVENT');
  end if;

  delete from private.dialogue_event_claims
  where game_id = p_game_id and expires_at <= v_now;
  delete from private.dialogue_messages
  where game_id = p_game_id and expires_at <= v_now;

  if exists (
    select 1 from private.dialogue_event_claims
    where game_id = p_game_id and event_id = p_event_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_DIALOGUE_EVENT');
  end if;

  insert into private.dialogue_runtime_state(game_id)
  values (p_game_id)
  on conflict (game_id) do nothing;

  select
    window_started_at,
    window_ai_calls,
    total_ai_calls,
    global_cooldown_until,
    active_generation_until,
    speaker_cooldowns,
    human_window_started_at,
    human_messages_in_window
  into
    v_window_started_at,
    v_window_ai_calls,
    v_total_ai_calls,
    v_global_cooldown_until,
    v_active_generation_until,
    v_speaker_cooldowns,
    v_human_window_started_at,
    v_human_messages_in_window
  from private.dialogue_runtime_state
  where game_id = p_game_id
  for update;

  if p_provider_call and v_active_generation_until is not null and v_active_generation_until > v_now then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_CONCURRENCY_LIMIT');
  end if;

  if v_window_started_at <= v_now - interval '60 seconds' then
    v_window_started_at := v_now;
    v_window_ai_calls := 0;
  end if;
  if v_human_window_started_at <= v_now - interval '30 seconds' then
    v_human_window_started_at := v_now;
    v_human_messages_in_window := 0;
  end if;

  v_intensity := v_policy->>'intensity';
  v_call_limit := case v_intensity when 'conservative' then 3 when 'chaos' then 10 else 6 end;
  v_cooldown_seconds := case v_intensity when 'conservative' then 20 when 'chaos' then 5 else 10 end;

  if p_provider_call and v_total_ai_calls >= 120 then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_BUDGET_EXHAUSTED');
  end if;
  if p_provider_call and v_window_ai_calls >= v_call_limit then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_RATE_LIMITED');
  end if;
  if p_is_human_message and v_human_messages_in_window >= 4 then
    return jsonb_build_object('ok', false, 'code', 'HUMAN_MESSAGE_RATE_LIMITED');
  end if;

  if not p_is_human_message then
    if v_global_cooldown_until is not null and v_global_cooldown_until > v_now then
      return jsonb_build_object('ok', false, 'code', 'DIALOGUE_COOLDOWN');
    end if;
    v_speaker_until_text := v_speaker_cooldowns->>p_speaker_bot_id;
    if v_speaker_until_text is not null and v_speaker_until_text::timestamptz > v_now then
      return jsonb_build_object('ok', false, 'code', 'DIALOGUE_SPEAKER_COOLDOWN');
    end if;
  end if;

  insert into private.dialogue_event_claims(game_id, event_id, event_type, reply_depth, claimed_at, expires_at)
  values (p_game_id, p_event_id, p_event_type, p_reply_depth, v_now, v_now + interval '2 minutes');

  v_lease_until := case when p_provider_call then v_now + interval '4 seconds' else null end;

  update private.dialogue_runtime_state
  set window_started_at = v_window_started_at,
      window_ai_calls = v_window_ai_calls + case when p_provider_call then 1 else 0 end,
      total_ai_calls = v_total_ai_calls + case when p_provider_call then 1 else 0 end,
      global_cooldown_until = v_now + make_interval(secs => v_cooldown_seconds),
      active_event_id = case when p_provider_call then p_event_id else null end,
      active_generation_until = v_lease_until,
      speaker_cooldowns = jsonb_set(
        coalesce(v_speaker_cooldowns, '{}'::jsonb),
        array[p_speaker_bot_id],
        to_jsonb((v_now + make_interval(secs => v_cooldown_seconds))::text),
        true
      ),
      human_window_started_at = v_human_window_started_at,
      human_messages_in_window = v_human_messages_in_window + case when p_is_human_message then 1 else 0 end,
      updated_at = v_now
  where game_id = p_game_id;

  return jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'leaseExpiresAt', v_lease_until,
    'policy', v_policy
  );
end;
$$;

revoke all on function public.claim_dialogue_event_internal(text, uuid, text, text, text, smallint, boolean, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_dialogue_event_internal(text, uuid, text, text, text, smallint, boolean, timestamptz, boolean)
  to service_role;
