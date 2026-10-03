alter table public.rooms
  add column if not exists bot_catalog_version text not null default 'popular-bots-v1';

alter table public.games
  add column if not exists bot_catalog_version text;

alter table public.room_seats
  add column if not exists bot_avatar_url text,
  add column if not exists bot_strategy_profile_id text,
  add column if not exists bot_catalog_version text;

alter table public.game_participants
  add column if not exists bot_avatar_url text,
  add column if not exists bot_strategy_profile_id text,
  add column if not exists bot_catalog_version text;

do $$
begin
  if exists (
    select 1 from public.room_seats
    where occupant_type = 'bot'
      and (bot_avatar_url is null or bot_strategy_profile_id is null or bot_catalog_version is null)
  ) or exists (
    select 1 from public.game_participants
    where owner_type = 'bot'
      and (bot_avatar_url is null or bot_strategy_profile_id is null or bot_catalog_version is null)
  ) then
    raise exception 'LEGACY_BOT_ROSTER_REQUIRES_MANUAL_RECONCILIATION';
  end if;
end;
$$;

alter table public.room_seats
  drop constraint if exists room_seats_occupant_shape_check;

alter table public.room_seats
  add constraint room_seats_occupant_shape_check check (
    (
      occupant_type = 'empty'
      and player_id is null
      and bot_id is null
      and bot_display_name is null
      and bot_personality_id is null
      and bot_avatar_url is null
      and bot_strategy_profile_id is null
      and bot_catalog_version is null
      and connected = false
    )
    or (
      occupant_type = 'human'
      and player_id is not null
      and bot_id is null
      and bot_display_name is null
      and bot_personality_id is null
      and bot_avatar_url is null
      and bot_strategy_profile_id is null
      and bot_catalog_version is null
    )
    or (
      occupant_type = 'bot'
      and player_id is null
      and bot_id is not null
      and bot_display_name is not null
      and bot_personality_id is not null
      and bot_avatar_url is not null
      and bot_strategy_profile_id is not null
      and bot_catalog_version is not null
      and connected = false
    )
  );

alter table public.game_participants
  drop constraint if exists game_participants_owner_shape_check;

alter table public.game_participants
  add constraint game_participants_owner_shape_check check (
    (
      owner_type = 'human'
      and player_id is not null
      and bot_id is null
      and bot_display_name is null
      and bot_personality_id is null
      and bot_avatar_url is null
      and bot_strategy_profile_id is null
      and bot_catalog_version is null
    )
    or (
      owner_type = 'bot'
      and player_id is null
      and bot_id is not null
      and bot_display_name is not null
      and bot_personality_id is not null
      and bot_avatar_url is not null
      and bot_strategy_profile_id is not null
      and bot_catalog_version is not null
    )
  );

create unique index if not exists room_seats_unique_bot_per_room
  on public.room_seats(room_id, bot_id)
  where occupant_type = 'bot' and bot_id is not null;

create unique index if not exists game_participants_unique_bot_per_game
  on public.game_participants(game_id, bot_id)
  where owner_type = 'bot' and bot_id is not null;

alter table private.room_command_ledger
  drop constraint if exists room_command_ledger_command_type_check;

alter table private.room_command_ledger
  add constraint room_command_ledger_command_type_check
  check (command_type in (
    'create_room',
    'join_room',
    'start_game',
    'assign_bot',
    'clear_bot',
    'replace_bot'
  ));

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
    'botSettings', jsonb_build_object('botsTalk', r.bots_talk, 'allowProfanity', r.allow_profanity),
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

create or replace function public.assign_bot_to_seat_internal(
  p_session_token text,
  p_action_id uuid,
  p_code text,
  p_seat_index smallint,
  p_expected_room_version bigint,
  p_bot_id text,
  p_bot_display_name text,
  p_bot_avatar_url text,
  p_bot_personality_id text,
  p_bot_strategy_profile_id text,
  p_bot_catalog_version text
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
  v_room public.rooms%rowtype;
  v_seat public.room_seats%rowtype;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if p_action_id is null
     or p_seat_index not between 0 and 3
     or p_expected_room_version is null
     or p_expected_room_version < 0
     or coalesce(p_bot_id, '') = ''
     or coalesce(p_bot_display_name, '') = ''
     or coalesce(p_bot_avatar_url, '') = ''
     or coalesce(p_bot_personality_id, '') = ''
     or coalesce(p_bot_strategy_profile_id, '') = ''
     or coalesce(p_bot_catalog_version, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|',
    'assign_bot', upper(trim(p_code)), p_seat_index::text,
    p_expected_room_version::text, p_bot_id, p_bot_display_name,
    p_bot_avatar_url, p_bot_personality_id, p_bot_strategy_profile_id,
    p_bot_catalog_version
  ), 'sha256'), 'hex');

  select * into v_existing
  from private.room_command_ledger
  where player_id = v_player_id and action_id = p_action_id;

  if found then
    if v_existing.command_type <> 'assign_bot'
       or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id)
    );
  end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id <> v_player_id then return jsonb_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED'); end if;
  if v_room.room_version <> p_expected_room_version then return jsonb_build_object('ok', false, 'code', 'STALE_ROOM_VERSION'); end if;
  if v_room.bot_catalog_version <> p_bot_catalog_version then return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED'); end if;

  select * into v_seat
  from public.room_seats
  where room_id = v_room.id and seat_index = p_seat_index
  for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE'); end if;
  if v_seat.occupant_type <> 'empty' then return jsonb_build_object('ok', false, 'code', 'SEAT_NOT_EMPTY'); end if;
  if exists (
    select 1 from public.room_seats
    where room_id = v_room.id and occupant_type = 'bot' and bot_id = p_bot_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'BOT_ALREADY_ASSIGNED');
  end if;

  update public.room_seats
  set occupant_type = 'bot',
      player_id = null,
      connected = false,
      bot_id = p_bot_id,
      bot_display_name = p_bot_display_name,
      bot_avatar_url = p_bot_avatar_url,
      bot_personality_id = p_bot_personality_id,
      bot_strategy_profile_id = p_bot_strategy_profile_id,
      bot_catalog_version = p_bot_catalog_version
  where room_id = v_room.id and seat_index = p_seat_index;

  update public.rooms
  set room_version = room_version + 1, updated_at = now()
  where id = v_room.id;

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (
    v_player_id, p_action_id, 'assign_bot', v_fingerprint,
    jsonb_build_object('roomId', v_room.id, 'roomCode', v_room.code, 'seatIndex', p_seat_index, 'botId', p_bot_id)
  );

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room.id, v_player_id));
end;
$$;

create or replace function public.clear_bot_seat_internal(
  p_session_token text,
  p_action_id uuid,
  p_code text,
  p_seat_index smallint,
  p_expected_room_version bigint
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
  v_room public.rooms%rowtype;
  v_seat public.room_seats%rowtype;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if p_action_id is null or p_seat_index not between 0 and 3 or p_expected_room_version is null or p_expected_room_version < 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|',
    'clear_bot', upper(trim(p_code)), p_seat_index::text, p_expected_room_version::text
  ), 'sha256'), 'hex');

  select * into v_existing
  from private.room_command_ledger
  where player_id = v_player_id and action_id = p_action_id;

  if found then
    if v_existing.command_type <> 'clear_bot' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id)
    );
  end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id <> v_player_id then return jsonb_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED'); end if;
  if v_room.room_version <> p_expected_room_version then return jsonb_build_object('ok', false, 'code', 'STALE_ROOM_VERSION'); end if;

  select * into v_seat
  from public.room_seats
  where room_id = v_room.id and seat_index = p_seat_index
  for update;

  if not found or v_seat.occupant_type <> 'bot' then
    return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED');
  end if;

  update public.room_seats
  set occupant_type = 'empty',
      player_id = null,
      connected = false,
      bot_id = null,
      bot_display_name = null,
      bot_avatar_url = null,
      bot_personality_id = null,
      bot_strategy_profile_id = null,
      bot_catalog_version = null
  where room_id = v_room.id and seat_index = p_seat_index;

  update public.rooms
  set room_version = room_version + 1, updated_at = now()
  where id = v_room.id;

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (
    v_player_id, p_action_id, 'clear_bot', v_fingerprint,
    jsonb_build_object('roomId', v_room.id, 'roomCode', v_room.code, 'seatIndex', p_seat_index)
  );

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room.id, v_player_id));
end;
$$;

create or replace function public.replace_bot_seat_internal(
  p_session_token text,
  p_action_id uuid,
  p_code text,
  p_seat_index smallint,
  p_expected_room_version bigint,
  p_bot_id text,
  p_bot_display_name text,
  p_bot_avatar_url text,
  p_bot_personality_id text,
  p_bot_strategy_profile_id text,
  p_bot_catalog_version text
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
  v_room public.rooms%rowtype;
  v_seat public.room_seats%rowtype;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if p_action_id is null
     or p_seat_index not between 0 and 3
     or p_expected_room_version is null
     or p_expected_room_version < 0
     or coalesce(p_bot_id, '') = ''
     or coalesce(p_bot_display_name, '') = ''
     or coalesce(p_bot_avatar_url, '') = ''
     or coalesce(p_bot_personality_id, '') = ''
     or coalesce(p_bot_strategy_profile_id, '') = ''
     or coalesce(p_bot_catalog_version, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ROOM_STATE');
  end if;

  v_fingerprint := encode(digest(concat_ws('|',
    'replace_bot', upper(trim(p_code)), p_seat_index::text,
    p_expected_room_version::text, p_bot_id, p_bot_display_name,
    p_bot_avatar_url, p_bot_personality_id, p_bot_strategy_profile_id,
    p_bot_catalog_version
  ), 'sha256'), 'hex');

  select * into v_existing
  from private.room_command_ledger
  where player_id = v_player_id and action_id = p_action_id;

  if found then
    if v_existing.command_type <> 'replace_bot' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id)
    );
  end if;

  select * into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id <> v_player_id then return jsonb_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED'); end if;
  if v_room.room_version <> p_expected_room_version then return jsonb_build_object('ok', false, 'code', 'STALE_ROOM_VERSION'); end if;
  if v_room.bot_catalog_version <> p_bot_catalog_version then return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED'); end if;

  select * into v_seat
  from public.room_seats
  where room_id = v_room.id and seat_index = p_seat_index
  for update;

  if not found or v_seat.occupant_type <> 'bot' then
    return jsonb_build_object('ok', false, 'code', 'BOT_ASSIGNMENT_NOT_ALLOWED');
  end if;
  if v_seat.bot_id = p_bot_id then return jsonb_build_object('ok', false, 'code', 'BOT_ALREADY_ASSIGNED'); end if;
  if exists (
    select 1 from public.room_seats
    where room_id = v_room.id
      and seat_index <> p_seat_index
      and occupant_type = 'bot'
      and bot_id = p_bot_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'BOT_ALREADY_ASSIGNED');
  end if;

  update public.room_seats
  set bot_id = p_bot_id,
      bot_display_name = p_bot_display_name,
      bot_avatar_url = p_bot_avatar_url,
      bot_personality_id = p_bot_personality_id,
      bot_strategy_profile_id = p_bot_strategy_profile_id,
      bot_catalog_version = p_bot_catalog_version
  where room_id = v_room.id and seat_index = p_seat_index;

  update public.rooms
  set room_version = room_version + 1, updated_at = now()
  where id = v_room.id;

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (
    v_player_id, p_action_id, 'replace_bot', v_fingerprint,
    jsonb_build_object('roomId', v_room.id, 'roomCode', v_room.code, 'seatIndex', p_seat_index, 'botId', p_bot_id)
  );

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room.id, v_player_id));
end;
$$;

drop function if exists public.start_room_internal(text, uuid, text);

create function public.start_room_internal(
  p_session_token text,
  p_action_id uuid,
  p_code text,
  p_expected_room_version bigint,
  p_ordered_bot_catalog jsonb
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
    where item->>'rulesVersion' is distinct from v_room.rules_version
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
    v_room.id, v_room.ruleset_id, v_room.rules_version, 1,
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
$$;

revoke all on function public.assign_bot_to_seat_internal(text,uuid,text,smallint,bigint,text,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.clear_bot_seat_internal(text,uuid,text,smallint,bigint)
  from public, anon, authenticated;
revoke all on function public.replace_bot_seat_internal(text,uuid,text,smallint,bigint,text,text,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.start_room_internal(text,uuid,text,bigint,jsonb)
  from public, anon, authenticated;

revoke all on function private.room_projection_internal(uuid,uuid)
  from public, anon, authenticated;

grant execute on function public.assign_bot_to_seat_internal(text,uuid,text,smallint,bigint,text,text,text,text,text,text)
  to service_role;
grant execute on function public.clear_bot_seat_internal(text,uuid,text,smallint,bigint)
  to service_role;
grant execute on function public.replace_bot_seat_internal(text,uuid,text,smallint,bigint,text,text,text,text,text,text)
  to service_role;
grant execute on function public.start_room_internal(text,uuid,text,bigint,jsonb)
  to service_role;
grant execute on function private.room_projection_internal(uuid,uuid)
  to service_role;
