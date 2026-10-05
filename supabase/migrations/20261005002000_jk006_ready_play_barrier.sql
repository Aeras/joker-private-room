create table if not exists private.game_table_readiness (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  table_ready boolean not null default false,
  presentation_complete boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

revoke all on private.game_table_readiness from public, anon, authenticated;
grant select, insert, update, delete on private.game_table_readiness to service_role;

create or replace function private.get_game_table_readiness_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_player_id uuid;
  v_room_id uuid;
  v_host_id uuid;
  v_lifecycle text;
  v_phase text;
  v_humans jsonb;
  v_all_ready boolean;
  v_all_presented boolean;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  select g.room_id, g.lifecycle, g.canonical_state#>>'{progression,phase}', r.host_player_id
  into v_room_id, v_lifecycle, v_phase, v_host_id
  from public.games g
  join public.rooms r on r.id = g.room_id
  where g.id = p_game_id;
  if v_room_id is null then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status = 'active'
  ) then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'playerId', gp.player_id,
      'seatIndex', gp.seat_index,
      'ready', coalesce(gr.table_ready, false),
      'presentationComplete', coalesce(gr.presentation_complete, false)
    ) order by gp.seat_index), '[]'::jsonb)
  into v_humans
  from public.game_participants gp
  left join private.game_table_readiness gr
    on gr.game_id = gp.game_id and gr.player_id = gp.player_id
  where gp.game_id = p_game_id
    and gp.owner_type = 'human'
    and gp.status = 'active';

  select not exists (
      select 1
      from public.game_participants gp
      left join private.game_table_readiness gr
        on gr.game_id = gp.game_id and gr.player_id = gp.player_id
      where gp.game_id = p_game_id
        and gp.owner_type = 'human'
        and gp.status = 'active'
        and coalesce(gr.table_ready, false) is false
    ),
    not exists (
      select 1
      from public.game_participants gp
      left join private.game_table_readiness gr
        on gr.game_id = gp.game_id and gr.player_id = gp.player_id
      where gp.game_id = p_game_id
        and gp.owner_type = 'human'
        and gp.status = 'active'
        and coalesce(gr.presentation_complete, false) is false
    )
  into v_all_ready, v_all_presented;

  return jsonb_build_object(
    'ok', true,
    'gameId', p_game_id,
    'viewerPlayerId', v_player_id,
    'isHost', v_player_id = v_host_id,
    'lifecycle', v_lifecycle,
    'phase', v_phase,
    'allReady', v_all_ready,
    'allPresented', v_all_presented,
    'humans', v_humans
  );
end;
$$;

create or replace function private.set_game_table_ready_internal(
  p_session_token text,
  p_game_id uuid,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_player_id uuid;
  v_lifecycle text;
  v_phase text;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  select lifecycle, canonical_state#>>'{progression,phase}'
  into v_lifecycle, v_phase
  from public.games where id = p_game_id;
  if v_lifecycle is null then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status = 'active'
  ) then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  if v_lifecycle <> 'starting' or v_phase not in ('INITIAL_DEALER_SELECTION', 'DEAL_SETUP') then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE');
  end if;

  insert into private.game_table_readiness(game_id, player_id, table_ready, presentation_complete, updated_at)
  values (p_game_id, v_player_id, p_ready, false, now())
  on conflict (game_id, player_id) do update
    set table_ready = excluded.table_ready,
        presentation_complete = case when excluded.table_ready then private.game_table_readiness.presentation_complete else false end,
        updated_at = now();

  return private.get_game_table_readiness_internal(p_session_token, p_game_id);
end;
$$;

create or replace function private.authorize_game_start_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_player_id uuid;
  v_host_id uuid;
  v_lifecycle text;
  v_phase text;
  v_selection_status text;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  select r.host_player_id, g.lifecycle, g.canonical_state#>>'{progression,phase}', g.canonical_state#>>'{initialDealerSelection,status}'
  into v_host_id, v_lifecycle, v_phase, v_selection_status
  from public.games g
  join public.rooms r on r.id = g.room_id
  where g.id = p_game_id
  for update of g;

  if v_host_id is null then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if v_player_id <> v_host_id then return jsonb_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  if v_lifecycle <> 'starting' or v_phase <> 'INITIAL_DEALER_SELECTION' or v_selection_status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE');
  end if;

  if exists (
    select 1
    from public.game_participants gp
    left join private.game_table_readiness gr
      on gr.game_id = gp.game_id and gr.player_id = gp.player_id
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.status = 'active'
      and coalesce(gr.table_ready, false) is false
  ) then return jsonb_build_object('ok', false, 'code', 'PLAYERS_NOT_READY'); end if;

  return jsonb_build_object('ok', true, 'gameId', p_game_id, 'authorized', true);
end;
$$;

create or replace function private.mark_game_start_presentation_complete_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_player_id uuid;
  v_lifecycle text;
  v_phase text;
  v_all_presented boolean;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;

  select lifecycle, canonical_state#>>'{progression,phase}' into v_lifecycle, v_phase
  from public.games where id = p_game_id;
  if v_lifecycle is null then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id and gp.owner_type = 'human' and gp.player_id = v_player_id and gp.status = 'active'
  ) then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;

  if v_lifecycle <> 'starting' or v_phase <> 'DEAL_SETUP' then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_ACTIVE');
  end if;

  insert into private.game_table_readiness(game_id, player_id, table_ready, presentation_complete, updated_at)
  values (p_game_id, v_player_id, true, true, now())
  on conflict (game_id, player_id) do update
    set table_ready = true, presentation_complete = true, updated_at = now();

  select not exists (
    select 1
    from public.game_participants gp
    left join private.game_table_readiness gr
      on gr.game_id = gp.game_id and gr.player_id = gp.player_id
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.status = 'active'
      and coalesce(gr.presentation_complete, false) is false
  ) into v_all_presented;

  return jsonb_build_object('ok', true, 'gameId', p_game_id, 'allPresented', v_all_presented);
end;
$$;

revoke all on function private.get_game_table_readiness_internal(text, uuid) from public, anon, authenticated;
revoke all on function private.set_game_table_ready_internal(text, uuid, boolean) from public, anon, authenticated;
revoke all on function private.authorize_game_start_internal(text, uuid) from public, anon, authenticated;
revoke all on function private.mark_game_start_presentation_complete_internal(text, uuid) from public, anon, authenticated;
grant execute on function private.get_game_table_readiness_internal(text, uuid) to service_role;
grant execute on function private.set_game_table_ready_internal(text, uuid, boolean) to service_role;
grant execute on function private.authorize_game_start_internal(text, uuid) to service_role;
grant execute on function private.mark_game_start_presentation_complete_internal(text, uuid) to service_role;

-- Startup barriers are intentionally dormant. The scheduler must not claim them.
create or replace function private.derive_game_next_wakeup_internal(
  p_canonical_state jsonb,
  p_lifecycle text,
  p_server_now timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public, private
as $$
declare
  v_phase text;
  v_actor_text text;
  v_actor integer;
  v_controller text;
  v_deadline_text text;
  v_deadline timestamptz;
begin
  if p_lifecycle = 'complete' then return null; end if;
  if p_canonical_state is null or jsonb_typeof(p_canonical_state) is distinct from 'object' then return p_server_now; end if;

  v_phase := p_canonical_state#>>'{progression,phase}';
  if v_phase in ('INITIAL_DEALER_SELECTION', 'DEAL_SETUP') then return null; end if;
  if v_phase in ('DEAL_RESULT', 'PHASE_RESULT') then return p_server_now; end if;

  v_actor_text := p_canonical_state#>>'{progression,currentActorSeat}';
  if v_actor_text is null or v_actor_text !~ '^[0-3]$' then return p_server_now; end if;
  v_actor := v_actor_text::integer;
  v_controller := p_canonical_state#>>array['seats', v_actor::text, 'controller'];
  if v_controller in ('permanent_bot', 'temporary_bot') then return p_server_now; end if;
  if v_controller = 'human' then
    v_deadline_text := p_canonical_state#>>'{timing,currentHumanDeadline}';
    if v_deadline_text is null or btrim(v_deadline_text) = '' then return p_server_now; end if;
    begin v_deadline := v_deadline_text::timestamptz;
    exception when others then return p_server_now;
    end;
    return v_deadline;
  end if;
  return p_server_now;
end;
$$;

revoke all on function private.derive_game_next_wakeup_internal(jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function private.derive_game_next_wakeup_internal(jsonb, text, timestamptz) to service_role;
