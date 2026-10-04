alter table public.games
  add column if not exists next_wakeup_at timestamptz;

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
  if p_lifecycle = 'complete' then
    return null;
  end if;

  -- A starting/active game with no canonical state must be repaired rather than
  -- silently disappearing from the scheduler's due set.
  if p_canonical_state is null or jsonb_typeof(p_canonical_state) is distinct from 'object' then
    return p_server_now;
  end if;

  v_phase := p_canonical_state#>>'{progression,phase}';
  if v_phase in ('INITIAL_DEALER_SELECTION', 'DEAL_RESULT', 'PHASE_RESULT') then
    return p_server_now;
  end if;

  v_actor_text := p_canonical_state#>>'{progression,currentActorSeat}';
  if v_actor_text is null or v_actor_text !~ '^[0-3]$' then
    -- A non-complete game without a valid actor is reconciliation work, not a
    -- reason to clear its durable wake.
    return p_server_now;
  end if;
  v_actor := v_actor_text::integer;

  v_controller := p_canonical_state#>>array['seats', v_actor::text, 'controller'];
  if v_controller in ('permanent_bot', 'temporary_bot') then
    return p_server_now;
  end if;

  if v_controller = 'human' then
    v_deadline_text := p_canonical_state#>>'{timing,currentHumanDeadline}';
    if v_deadline_text is null or btrim(v_deadline_text) = '' then
      -- Missing deadline would otherwise strand an active human turn.
      return p_server_now;
    end if;

    begin
      v_deadline := v_deadline_text::timestamptz;
    exception when others then
      return p_server_now;
    end;
    return v_deadline;
  end if;

  -- Unknown controller/state is deliberately due-now so reconciliation can
  -- surface the canonical error rather than leaving the match stranded.
  return p_server_now;
end;
$$;

revoke all on function private.derive_game_next_wakeup_internal(jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function private.derive_game_next_wakeup_internal(jsonb, text, timestamptz)
  to service_role;

create or replace function private.sync_game_next_wakeup_internal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  new.next_wakeup_at := private.derive_game_next_wakeup_internal(
    new.canonical_state,
    new.lifecycle,
    statement_timestamp()
  );
  return new;
end;
$$;

revoke all on function private.sync_game_next_wakeup_internal()
  from public, anon, authenticated;
grant execute on function private.sync_game_next_wakeup_internal()
  to service_role;

drop trigger if exists sync_game_next_wakeup on public.games;
create trigger sync_game_next_wakeup
before insert or update of canonical_state, lifecycle
on public.games
for each row
execute function private.sync_game_next_wakeup_internal();

-- Repair/backfill every non-complete row from its current canonical state.
update public.games
set next_wakeup_at = private.derive_game_next_wakeup_internal(
  canonical_state,
  lifecycle,
  statement_timestamp()
)
where lifecycle in ('starting', 'active');

update public.games
set next_wakeup_at = null
where lifecycle = 'complete' and next_wakeup_at is not null;

create index if not exists games_next_wakeup_due_idx
  on public.games (next_wakeup_at, id)
  where lifecycle in ('starting', 'active') and next_wakeup_at is not null;

revoke all on public.games from public, anon, authenticated;
