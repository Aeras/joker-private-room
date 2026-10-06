-- JK-006: turn-card presentation is client-local UX and must never hold
-- authoritative multiplayer progression. Legacy boundaries are due immediately.
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

  -- Lobby/table preparation remains intentionally gated by its own readiness flow.
  if p_lifecycle = 'starting' and v_phase in ('INITIAL_DEALER_SELECTION', 'DEAL_SETUP') then
    return null;
  end if;

  -- Pre-upgrade turnPresentation boundaries are compatibility state only.
  -- Wake immediately so the reconciler removes them without waiting for a browser.
  if jsonb_typeof(p_canonical_state#>'{timing,turnPresentation}') = 'object' then
    return p_server_now;
  end if;

  if v_phase in ('INITIAL_DEALER_SELECTION', 'DEAL_RESULT', 'PHASE_RESULT') then
    return p_server_now;
  end if;

  if v_phase in ('DEAL_PRESENTATION', 'NINE_CARD_INITIAL_DEAL_ALL_SEATS', 'NINE_CARD_REMAINING_DEAL') then
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
