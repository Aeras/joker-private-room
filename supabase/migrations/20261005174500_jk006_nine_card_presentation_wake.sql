-- JK-006: nine-card presentation barriers prefer a real browser completion ack,
-- but must remain durable when every browser disappears. presentationReadyAt is
-- the server fallback boundary. The scheduler sleeps until that instant instead
-- of spinning on an actor-less active phase.

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
  v_owner_type text;
  v_reclaimable_text text;
  v_timeout_takeover_text text;
  v_deadline_text text;
  v_deadline timestamptz;
  v_presentation_ready_text text;
  v_presentation_ready timestamptz;
begin
  if p_lifecycle = 'complete' then
    return null;
  end if;

  if p_canonical_state is null or jsonb_typeof(p_canonical_state) is distinct from 'object' then
    return p_server_now;
  end if;

  v_phase := p_canonical_state#>>'{progression,phase}';
  if v_phase in ('INITIAL_DEALER_SELECTION', 'DEAL_RESULT', 'PHASE_RESULT') then
    return p_server_now;
  end if;

  if v_phase in ('NINE_CARD_INITIAL_DEAL_ALL_SEATS', 'NINE_CARD_REMAINING_DEAL') then
    v_presentation_ready_text := p_canonical_state#>>'{timing,presentationReadyAt}';
    if v_presentation_ready_text is null or btrim(v_presentation_ready_text) = '' then
      return p_server_now;
    end if;
    begin
      v_presentation_ready := v_presentation_ready_text::timestamptz;
    exception when others then
      return p_server_now;
    end;
    return v_presentation_ready;
  end if;

  v_actor_text := p_canonical_state#>>'{progression,currentActorSeat}';
  if v_actor_text is null or v_actor_text !~ '^[0-3]$' then
    return p_server_now;
  end if;
  v_actor := v_actor_text::integer;

  v_controller := p_canonical_state#>>array['seats', v_actor::text, 'controller'];
  if v_controller in ('permanent_bot', 'temporary_bot') then
    return p_server_now;
  end if;

  if v_controller = 'human' then
    v_owner_type := p_canonical_state#>>array['seats', v_actor::text, 'owner', 'type'];
    v_reclaimable_text := p_canonical_state#>>array['seats', v_actor::text, 'reclaimable'];
    v_timeout_takeover_text := p_canonical_state#>>'{timing,timeoutTakeoverActive}';
    v_deadline_text := p_canonical_state#>>'{timing,currentHumanDeadline}';

    if v_owner_type = 'human'
       and v_reclaimable_text = 'true'
       and coalesce(v_timeout_takeover_text, 'false') = 'false'
       and (v_deadline_text is null or btrim(v_deadline_text) = '') then
      return null;
    end if;

    if v_deadline_text is null or btrim(v_deadline_text) = '' then
      return p_server_now;
    end if;

    begin
      v_deadline := v_deadline_text::timestamptz;
    exception when others then
      return p_server_now;
    end;
    return v_deadline;
  end if;

  return p_server_now;
end;
$$;

revoke all on function private.derive_game_next_wakeup_internal(jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function private.derive_game_next_wakeup_internal(jsonb, text, timestamptz)
  to service_role;

create or replace function private.repair_game_wakeups_internal(p_limit integer default 32)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
begin
  with candidates as (
    select g.id,
      private.derive_game_next_wakeup_internal(
        g.canonical_state,
        g.lifecycle,
        statement_timestamp()
      ) as expected_wake
    from public.games g
    where (g.lifecycle = 'complete' and g.next_wakeup_at is not null)
       or (
         g.lifecycle in ('starting', 'active')
         and g.next_wakeup_at is distinct from private.derive_game_next_wakeup_internal(
           g.canonical_state,
           g.lifecycle,
           statement_timestamp()
         )
       )
    order by g.id
    for update of g skip locked
    limit greatest(1, least(coalesce(p_limit, 32), 128))
  ), repaired as (
    update public.games g
    set next_wakeup_at = c.expected_wake
    from candidates c
    where g.id = c.id
    returning g.id
  )
  select count(*) into v_count from repaired;
  return v_count;
end;
$$;

revoke all on function private.repair_game_wakeups_internal(integer)
  from public, anon, authenticated;
grant execute on function private.repair_game_wakeups_internal(integer)
  to service_role;

update public.games
set next_wakeup_at = private.derive_game_next_wakeup_internal(
  canonical_state,
  lifecycle,
  statement_timestamp()
)
where lifecycle in ('starting', 'active')
  and next_wakeup_at is distinct from private.derive_game_next_wakeup_internal(
    canonical_state,
    lifecycle,
    statement_timestamp()
  );