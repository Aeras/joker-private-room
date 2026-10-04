create table if not exists private.dialogue_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  event_id text not null,
  speaker_bot_id text not null,
  target_seat smallint,
  message_text text not null,
  source text not null,
  reply_depth smallint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 seconds'),
  unique (game_id, event_id, speaker_bot_id),
  check (char_length(event_id) between 1 and 128),
  check (char_length(speaker_bot_id) between 1 and 64),
  check (target_seat is null or target_seat between 0 and 3),
  check (char_length(message_text) between 1 and 100),
  check (source in ('preset', 'gemini')),
  check (reply_depth between 0 and 1),
  check (expires_at > created_at)
);

create index if not exists dialogue_messages_active_idx
  on private.dialogue_messages(game_id, expires_at, created_at);

alter table private.dialogue_messages enable row level security;
revoke all on private.dialogue_messages from public, anon, authenticated;
grant all on private.dialogue_messages to service_role;

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
  if v_global_cooldown_until is not null and v_global_cooldown_until > v_now then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_COOLDOWN');
  end if;
  v_speaker_until_text := v_speaker_cooldowns->>p_speaker_bot_id;
  if v_speaker_until_text is not null and v_speaker_until_text::timestamptz > v_now then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_SPEAKER_COOLDOWN');
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

create or replace function public.release_dialogue_slot_internal(
  p_session_token text,
  p_game_id uuid,
  p_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;
  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status in ('active', 'completed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;
  update private.dialogue_runtime_state
  set active_event_id = null,
      active_generation_until = null,
      updated_at = now()
  where game_id = p_game_id and active_event_id = p_event_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.publish_dialogue_message_internal(
  p_session_token text,
  p_game_id uuid,
  p_event_id text,
  p_speaker_bot_id text,
  p_target_seat smallint,
  p_message_text text,
  p_source text,
  p_reply_depth smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_row private.dialogue_messages%rowtype;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if p_message_text is null or char_length(trim(p_message_text)) not between 1 and 100
     or p_source not in ('preset', 'gemini')
     or p_reply_depth not between 0 and 1
     or (p_target_seat is not null and p_target_seat not between 0 and 3) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_MESSAGE');
  end if;
  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status in ('active', 'completed')
  ) then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if not exists (
    select 1 from private.dialogue_event_claims c
    where c.game_id = p_game_id and c.event_id = p_event_id and c.expires_at > now()
  ) then return jsonb_build_object('ok', false, 'code', 'DIALOGUE_EVENT_NOT_CLAIMED'); end if;

  delete from private.dialogue_messages where game_id = p_game_id and expires_at <= now();

  insert into private.dialogue_messages(
    game_id, event_id, speaker_bot_id, target_seat, message_text, source, reply_depth
  ) values (
    p_game_id, p_event_id, p_speaker_bot_id, p_target_seat, trim(p_message_text), p_source, p_reply_depth
  )
  on conflict (game_id, event_id, speaker_bot_id) do update
    set target_seat = excluded.target_seat,
        message_text = excluded.message_text,
        source = excluded.source,
        reply_depth = excluded.reply_depth,
        created_at = now(),
        expires_at = now() + interval '8 seconds'
  returning * into v_row;

  return jsonb_build_object('ok', true, 'message', jsonb_build_object(
    'id', v_row.id,
    'eventId', v_row.event_id,
    'speakerBotId', v_row.speaker_bot_id,
    'targetSeat', v_row.target_seat,
    'text', v_row.message_text,
    'source', v_row.source,
    'replyDepth', v_row.reply_depth,
    'createdAt', v_row.created_at,
    'expiresAt', v_row.expires_at
  ));
end;
$$;

create or replace function public.list_dialogue_messages_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_messages jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status in ('active', 'completed')
  ) then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  delete from private.dialogue_messages where game_id = p_game_id and expires_at <= now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'eventId', m.event_id,
    'speakerBotId', m.speaker_bot_id,
    'targetSeat', m.target_seat,
    'text', m.message_text,
    'source', m.source,
    'replyDepth', m.reply_depth,
    'createdAt', m.created_at,
    'expiresAt', m.expires_at
  ) order by m.created_at), '[]'::jsonb)
  into v_messages
  from private.dialogue_messages m
  where m.game_id = p_game_id and m.expires_at > now();

  return jsonb_build_object('ok', true, 'messages', v_messages);
end;
$$;

revoke all on function public.claim_dialogue_event_internal(text, uuid, text, text, text, smallint, boolean, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_dialogue_event_internal(text, uuid, text, text, text, smallint, boolean, timestamptz, boolean) to service_role;
revoke all on function public.release_dialogue_slot_internal(text, uuid, text) from public, anon, authenticated;
grant execute on function public.release_dialogue_slot_internal(text, uuid, text) to service_role;
revoke all on function public.publish_dialogue_message_internal(text, uuid, text, text, smallint, text, text, smallint) from public, anon, authenticated;
grant execute on function public.publish_dialogue_message_internal(text, uuid, text, text, smallint, text, text, smallint) to service_role;
revoke all on function public.list_dialogue_messages_internal(text, uuid) from public, anon, authenticated;
grant execute on function public.list_dialogue_messages_internal(text, uuid) to service_role;
