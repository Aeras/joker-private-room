create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4}$'),
  host_player_id uuid not null references public.players(id),
  ruleset_id text not null check (ruleset_id = 'popular'),
  rules_version text not null default 'popular-v1',
  status text not null default 'lobby' check (status in ('lobby','playing')),
  room_version bigint not null default 0,
  bots_talk boolean not null default false,
  allow_profanity boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  constraint rooms_bot_settings_check check (not allow_profanity or bots_talk)
);

create table if not exists public.room_seats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 3),
  occupant_type text not null default 'empty' check (occupant_type in ('empty','human','bot')),
  player_id uuid references public.players(id),
  connected boolean not null default false,
  bot_id text,
  bot_display_name text,
  bot_personality_id text,
  primary key (room_id, seat_index),
  constraint room_seats_occupant_shape_check check (
    (occupant_type = 'empty' and player_id is null and bot_id is null and bot_display_name is null and bot_personality_id is null and connected = false)
    or
    (occupant_type = 'human' and player_id is not null and bot_id is null and bot_display_name is null and bot_personality_id is null)
    or
    (occupant_type = 'bot' and player_id is null and bot_id is not null and bot_display_name is not null and bot_personality_id is not null and connected = false)
  )
);

create unique index if not exists room_seats_unique_human_per_room
  on public.room_seats(room_id, player_id)
  where occupant_type = 'human' and player_id is not null;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete restrict,
  ruleset_id text not null check (ruleset_id = 'popular'),
  rules_version text not null,
  state_schema_version integer not null default 1,
  state_version bigint not null default 0,
  lifecycle text not null default 'starting' check (lifecycle in ('starting','active','complete')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.rooms add column if not exists current_game_id uuid references public.games(id) on delete set null;

create table if not exists public.game_participants (
  game_id uuid not null references public.games(id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 3),
  owner_type text not null check (owner_type in ('human','bot')),
  player_id uuid references public.players(id),
  bot_id text,
  bot_display_name text,
  bot_personality_id text,
  status text not null default 'active' check (status in ('active','completed')),
  final_score integer,
  final_placement integer,
  primary key (game_id, seat_index),
  constraint game_participants_owner_shape_check check (
    (owner_type = 'human' and player_id is not null and bot_id is null and bot_display_name is null and bot_personality_id is null)
    or
    (owner_type = 'bot' and player_id is null and bot_id is not null and bot_display_name is not null and bot_personality_id is not null)
  )
);

create unique index if not exists game_participants_one_active_game_per_human
  on public.game_participants(player_id)
  where owner_type = 'human' and status = 'active' and player_id is not null;

create table if not exists private.room_command_ledger (
  player_id uuid not null references public.players(id) on delete cascade,
  action_id uuid not null,
  command_type text not null check (command_type in ('create_room','join_room','start_game')),
  request_fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (player_id, action_id)
);

alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.games enable row level security;
alter table public.game_participants enable row level security;

revoke all on public.rooms from anon, authenticated;
revoke all on public.room_seats from anon, authenticated;
revoke all on public.games from anon, authenticated;
revoke all on public.game_participants from anon, authenticated;
revoke all on private.room_command_ledger from anon, authenticated;

grant all on public.rooms to service_role;
grant all on public.room_seats to service_role;
grant all on public.games to service_role;
grant all on public.game_participants to service_role;
grant all on private.room_command_ledger to service_role;

create or replace function private.room_projection_internal(p_room_id uuid, p_viewer_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'code', r.code,
    'hostId', r.host_player_id,
    'rulesetId', r.ruleset_id,
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
                'personalityId', s.bot_personality_id
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

create or replace function private.generate_room_code_internal()
returns text
language plpgsql
volatile
security definer
set search_path = public, private, pg_temp
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    if not exists (select 1 from public.rooms where code = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function private.active_game_for_player_internal(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object('gameId', g.id, 'roomCode', r.code)
  from public.game_participants gp
  join public.games g on g.id = gp.game_id
  join public.rooms r on r.id = g.room_id
  where gp.player_id = p_player_id
    and gp.owner_type = 'human'
    and gp.status = 'active'
  limit 1;
$$;

create or replace function public.get_room_for_session_internal(p_session_token text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_room_id uuid;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select r.id into v_room_id
  from public.rooms r
  join public.room_seats s on s.room_id = r.id
  where r.code = upper(trim(p_code))
    and s.occupant_type = 'human'
    and s.player_id = v_player_id
  limit 1;

  if v_room_id is null then
    return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room_id, v_player_id));
end;
$$;

create or replace function public.create_room_internal(
  p_session_token text,
  p_action_id uuid,
  p_ruleset_id text,
  p_bots_talk boolean,
  p_allow_profanity boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
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
    return jsonb_build_object('ok', true, 'replayed', true, 'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id));
  end if;

  v_active := private.active_game_for_player_internal(v_player_id);
  if v_active is not null then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS', 'activeGame', v_active);
  end if;

  v_code := private.generate_room_code_internal();
  insert into public.rooms(code, host_player_id, ruleset_id, rules_version, bots_talk, allow_profanity)
  values (v_code, v_player_id, 'popular', 'popular-v1', p_bots_talk, p_allow_profanity)
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
$$;

create or replace function public.join_room_internal(p_session_token text, p_action_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_fingerprint text;
  v_existing private.room_command_ledger%rowtype;
  v_active jsonb;
  v_room public.rooms%rowtype;
  v_seat smallint;
begin
  select v.id into v_player_id from public.validate_player_session_internal(p_session_token) v limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  v_fingerprint := encode(digest(concat_ws('|','join_room',upper(trim(p_code))), 'sha256'), 'hex');
  select * into v_existing from private.room_command_ledger where player_id = v_player_id and action_id = p_action_id;
  if found then
    if v_existing.command_type <> 'join_room' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id));
  end if;

  v_active := private.active_game_for_player_internal(v_player_id);
  if v_active is not null then return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS', 'activeGame', v_active); end if;

  select * into v_room from public.rooms where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND'); end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'ROOM_ALREADY_STARTED'); end if;

  if exists (select 1 from public.room_seats where room_id = v_room.id and occupant_type = 'human' and player_id = v_player_id) then
    insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
    values (v_player_id, p_action_id, 'join_room', v_fingerprint, jsonb_build_object('roomId', v_room.id, 'roomCode', v_room.code));
    return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room.id, v_player_id));
  end if;

  select seat_index into v_seat from public.room_seats where room_id = v_room.id and occupant_type = 'empty' order by seat_index limit 1 for update;
  if v_seat is null then return jsonb_build_object('ok', false, 'code', 'ROOM_FULL'); end if;

  update public.room_seats set occupant_type = 'human', player_id = v_player_id, connected = true where room_id = v_room.id and seat_index = v_seat;
  update public.rooms set room_version = room_version + 1, updated_at = now() where id = v_room.id;

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (v_player_id, p_action_id, 'join_room', v_fingerprint, jsonb_build_object('roomId', v_room.id, 'roomCode', v_room.code));

  return jsonb_build_object('ok', true, 'room', private.room_projection_internal(v_room.id, v_player_id));
end;
$$;

create or replace function public.start_room_internal(p_session_token text, p_action_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_fingerprint text;
  v_existing private.room_command_ledger%rowtype;
  v_room public.rooms%rowtype;
  v_active jsonb;
  v_game_id uuid;
  v_seat record;
begin
  select v.id into v_player_id from public.validate_player_session_internal(p_session_token) v limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  v_fingerprint := encode(digest(concat_ws('|','start_game',upper(trim(p_code))), 'sha256'), 'hex');
  select * into v_existing from private.room_command_ledger where player_id = v_player_id and action_id = p_action_id;
  if found then
    if v_existing.command_type <> 'start_game' or v_existing.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('ok', false, 'code', 'ACTION_ID_CONFLICT');
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'gameId', v_existing.result->>'gameId', 'room', private.room_projection_internal((v_existing.result->>'roomId')::uuid, v_player_id));
  end if;

  select * into v_room from public.rooms where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND'); end if;
  if v_room.host_player_id <> v_player_id then return jsonb_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('ok', false, 'code', 'ROOM_ALREADY_STARTED'); end if;

  for v_seat in select player_id from public.room_seats where room_id = v_room.id and occupant_type = 'human' order by seat_index loop
    v_active := private.active_game_for_player_internal(v_seat.player_id);
    if v_active is not null then return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS', 'activeGame', v_active); end if;
  end loop;

  update public.room_seats set
    occupant_type = 'bot', connected = false, bot_id = 'bot-' || seat_index::text,
    bot_personality_id = case seat_index when 0 then 'tamara' when 1 then 'grisha' when 2 then 'serge' else 'valeria' end,
    bot_display_name = case seat_index when 0 then 'Θεία Ταμάρα' when 1 then 'Γκρίσα ο Ύποπτος' when 2 then 'Σερζ ο Μαθηματικός' else 'Βαλέρια η Επικίνδυνη' end
  where room_id = v_room.id and occupant_type = 'empty';

  insert into public.games(room_id, ruleset_id, rules_version, state_schema_version, state_version, lifecycle)
  values (v_room.id, v_room.ruleset_id, v_room.rules_version, 1, 0, 'starting') returning id into v_game_id;

  begin
    insert into public.game_participants(game_id, seat_index, owner_type, player_id, bot_id, bot_display_name, bot_personality_id, status)
    select v_game_id, seat_index, case when occupant_type = 'human' then 'human' else 'bot' end, player_id, bot_id, bot_display_name, bot_personality_id, 'active'
    from public.room_seats where room_id = v_room.id order by seat_index;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'ACTIVE_GAME_EXISTS';
  end;

  update public.rooms set status = 'playing', current_game_id = v_game_id, room_version = room_version + 1, started_at = now(), updated_at = now() where id = v_room.id;

  insert into private.room_command_ledger(player_id, action_id, command_type, request_fingerprint, result)
  values (v_player_id, p_action_id, 'start_game', v_fingerprint, jsonb_build_object('roomId', v_room.id, 'roomCode', v_room.code, 'gameId', v_game_id));

  return jsonb_build_object('ok', true, 'gameId', v_game_id, 'room', private.room_projection_internal(v_room.id, v_player_id));
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'code', 'ACTIVE_GAME_EXISTS');
end;
$$;

revoke all on function public.get_room_for_session_internal(text,text) from public, anon, authenticated;
revoke all on function public.create_room_internal(text,uuid,text,boolean,boolean) from public, anon, authenticated;
revoke all on function public.join_room_internal(text,uuid,text) from public, anon, authenticated;
revoke all on function public.start_room_internal(text,uuid,text) from public, anon, authenticated;

grant execute on function public.get_room_for_session_internal(text,text) to service_role;
grant execute on function public.create_room_internal(text,uuid,text,boolean,boolean) to service_role;
grant execute on function public.join_room_internal(text,uuid,text) to service_role;
grant execute on function public.start_room_internal(text,uuid,text) to service_role;

revoke all on function private.room_projection_internal(uuid,uuid) from public, anon, authenticated;
revoke all on function private.generate_room_code_internal() from public, anon, authenticated;
revoke all on function private.active_game_for_player_internal(uuid) from public, anon, authenticated;

grant execute on function private.room_projection_internal(uuid,uuid) to service_role;
grant execute on function private.generate_room_code_internal() to service_role;
grant execute on function private.active_game_for_player_internal(uuid) to service_role;
