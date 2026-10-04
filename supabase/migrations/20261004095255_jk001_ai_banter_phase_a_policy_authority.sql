alter table public.rooms
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists dialogue_intensity text not null default 'normal';

alter table public.rooms
  drop constraint if exists rooms_dialogue_settings_check;

alter table public.rooms
  add constraint rooms_dialogue_settings_check check (
    dialogue_intensity in ('conservative', 'normal', 'chaos')
    and (bots_talk or (not allow_profanity and not ai_enabled))
  );

alter table public.games
  add column if not exists dialogue_policy jsonb not null default jsonb_build_object(
    'policyVersion', 'dialogue-policy-v1',
    'speechEnabled', false,
    'allowProfanity', false,
    'aiEnabled', false,
    'intensity', 'normal'
  );

update public.games g
set dialogue_policy = jsonb_build_object(
  'policyVersion', 'dialogue-policy-v1',
  'speechEnabled', r.bots_talk,
  'allowProfanity', case when r.bots_talk then r.allow_profanity else false end,
  'aiEnabled', case when r.bots_talk then r.ai_enabled else false end,
  'intensity', r.dialogue_intensity
)
from public.rooms r
where r.id = g.room_id;

alter table public.games
  drop constraint if exists games_dialogue_policy_check;

alter table public.games
  add constraint games_dialogue_policy_check check (
    jsonb_typeof(dialogue_policy) = 'object'
    and dialogue_policy ? 'policyVersion'
    and dialogue_policy ? 'speechEnabled'
    and dialogue_policy ? 'allowProfanity'
    and dialogue_policy ? 'aiEnabled'
    and dialogue_policy ? 'intensity'
    and dialogue_policy->>'policyVersion' = 'dialogue-policy-v1'
    and jsonb_typeof(dialogue_policy->'speechEnabled') = 'boolean'
    and jsonb_typeof(dialogue_policy->'allowProfanity') = 'boolean'
    and jsonb_typeof(dialogue_policy->'aiEnabled') = 'boolean'
    and dialogue_policy->>'intensity' in ('conservative', 'normal', 'chaos')
    and (
      (dialogue_policy->>'speechEnabled')::boolean
      or (
        not (dialogue_policy->>'allowProfanity')::boolean
        and not (dialogue_policy->>'aiEnabled')::boolean
      )
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
    'intensity', v_room.dialogue_intensity
  );

  return new;
end;
$$;

revoke all on function private.snapshot_game_dialogue_policy_internal() from public, anon, authenticated;

DROP TRIGGER IF EXISTS games_snapshot_dialogue_policy ON public.games;
CREATE TRIGGER games_snapshot_dialogue_policy
BEFORE INSERT ON public.games
FOR EACH ROW
EXECUTE FUNCTION private.snapshot_game_dialogue_policy_internal();

create table if not exists private.dialogue_runtime_state (
  game_id uuid primary key references public.games(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  window_ai_calls integer not null default 0 check (window_ai_calls >= 0),
  total_ai_calls integer not null default 0 check (total_ai_calls >= 0),
  global_cooldown_until timestamptz,
  active_event_id text,
  active_generation_until timestamptz,
  speaker_cooldowns jsonb not null default '{}'::jsonb check (jsonb_typeof(speaker_cooldowns) = 'object'),
  human_window_started_at timestamptz not null default now(),
  human_messages_in_window integer not null default 0 check (human_messages_in_window >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists private.dialogue_event_claims (
  game_id uuid not null references public.games(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  reply_depth smallint not null check (reply_depth between 0 and 1),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (game_id, event_id),
  check (char_length(event_id) between 1 and 128),
  check (char_length(event_type) between 1 and 64),
  check (expires_at > claimed_at)
);

create index if not exists dialogue_event_claims_expiry_idx
  on private.dialogue_event_claims(expires_at);

alter table private.dialogue_runtime_state enable row level security;
alter table private.dialogue_event_claims enable row level security;

revoke all on private.dialogue_runtime_state from public, anon, authenticated;
revoke all on private.dialogue_event_claims from public, anon, authenticated;
grant all on private.dialogue_runtime_state to service_role;
grant all on private.dialogue_event_claims to service_role;

create or replace function private.room_projection_internal(p_room_id uuid, p_viewer_id uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select jsonb_build_object(
    'code', r.code,
    'hostId', r.host_player_id,
    'rulesetId', r.ruleset_id,
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
$$;

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
  if p_ruleset_id <> 'popular' then
    return jsonb_build_object('ok', false, 'code', 'RULESET_NOT_IMPLEMENTED');
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
    v_code, v_player_id, 'popular', 'popular-v1',
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
$$;

create or replace function public.get_dialogue_policy_internal(
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
  v_policy jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select g.dialogue_policy into v_policy
  from public.games g
  join public.game_participants gp on gp.game_id = g.id
  where g.id = p_game_id
    and gp.owner_type = 'human'
    and gp.player_id = v_player_id
    and gp.status = 'active'
    and g.lifecycle <> 'complete'
  limit 1;

  if v_policy is null then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'policy', v_policy);
end;
$$;

create or replace function public.claim_ai_dialogue_internal(
  p_session_token text,
  p_game_id uuid,
  p_event_id text,
  p_event_type text,
  p_speaker_bot_id text,
  p_reply_depth smallint,
  p_is_human_message boolean,
  p_event_created_at timestamptz
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
  v_active_event_id text;
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
    and gp.status = 'active'
    and g.lifecycle <> 'complete'
  limit 1;

  if v_policy is null then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;
  if not coalesce((v_policy->>'speechEnabled')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_DISABLED');
  end if;
  if not coalesce((v_policy->>'aiEnabled')::boolean, false) then
    return jsonb_build_object('ok', false, 'code', 'AI_DISABLED');
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'bot'
      and gp.bot_id = p_speaker_bot_id
      and gp.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_TARGET');
  end if;

  if p_event_created_at < v_now - interval '30 seconds'
     or p_event_created_at > v_now + interval '5 seconds' then
    return jsonb_build_object('ok', false, 'code', 'STALE_DIALOGUE_EVENT');
  end if;

  delete from private.dialogue_event_claims
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
    active_event_id,
    active_generation_until,
    speaker_cooldowns,
    human_window_started_at,
    human_messages_in_window
  into
    v_window_started_at,
    v_window_ai_calls,
    v_total_ai_calls,
    v_global_cooldown_until,
    v_active_event_id,
    v_active_generation_until,
    v_speaker_cooldowns,
    v_human_window_started_at,
    v_human_messages_in_window
  from private.dialogue_runtime_state
  where game_id = p_game_id
  for update;

  if v_active_generation_until is not null and v_active_generation_until > v_now then
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
  v_call_limit := case v_intensity
    when 'conservative' then 3
    when 'chaos' then 10
    else 6
  end;
  v_cooldown_seconds := case v_intensity
    when 'conservative' then 20
    when 'chaos' then 5
    else 10
  end;

  if v_total_ai_calls >= 120 then
    return jsonb_build_object('ok', false, 'code', 'DIALOGUE_BUDGET_EXHAUSTED');
  end if;
  if v_window_ai_calls >= v_call_limit then
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

  insert into private.dialogue_event_claims(
    game_id, event_id, event_type, reply_depth, claimed_at, expires_at
  )
  values (
    p_game_id, p_event_id, p_event_type, p_reply_depth, v_now, v_now + interval '2 minutes'
  );

  v_lease_until := v_now + interval '4 seconds';

  update private.dialogue_runtime_state
  set window_started_at = v_window_started_at,
      window_ai_calls = v_window_ai_calls + 1,
      total_ai_calls = v_total_ai_calls + 1,
      global_cooldown_until = v_now + make_interval(secs => v_cooldown_seconds),
      active_event_id = p_event_id,
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

create or replace function public.release_ai_dialogue_slot_internal(
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
    select 1
    from public.game_participants gp
    join public.games g on g.id = gp.game_id
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status = 'active'
      and g.lifecycle <> 'complete'
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  update private.dialogue_runtime_state
  set active_event_id = null,
      active_generation_until = null,
      updated_at = now()
  where game_id = p_game_id
    and active_event_id = p_event_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.create_room_internal(text, uuid, text, boolean, boolean, boolean, text)
  to service_role;

revoke all on function public.get_dialogue_policy_internal(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_dialogue_policy_internal(text, uuid)
  to service_role;

revoke all on function public.claim_ai_dialogue_internal(text, uuid, text, text, text, smallint, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_ai_dialogue_internal(text, uuid, text, text, text, smallint, boolean, timestamptz)
  to service_role;

revoke all on function public.release_ai_dialogue_slot_internal(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_ai_dialogue_slot_internal(text, uuid, text)
  to service_role;
