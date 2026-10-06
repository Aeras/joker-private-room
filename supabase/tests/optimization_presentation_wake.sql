-- Local/staging acceptance only. Does not modify game data. Owner runs after migration.
begin;
do $$
declare
  v_now timestamptz := '2026-10-06T00:00:00Z';
  v_ready timestamptz := '2026-10-06T00:00:45Z';
  v_state jsonb;
begin
  v_state := '{"progression":{"phase":"INITIAL_DEALER_SELECTION"}}';
  if private.derive_game_next_wakeup_internal(v_state, 'starting', v_now) is not null then raise exception 'Lobby/start must not spin'; end if;
  v_state := '{"progression":{"phase":"DEAL_SETUP"}}';
  if private.derive_game_next_wakeup_internal(v_state, 'starting', v_now) is not null then raise exception 'Startup presentation must not spin'; end if;
  foreach v_state in array array[
    '{"progression":{"phase":"DEAL_PRESENTATION"},"timing":{"presentationReadyAt":"2026-10-06T00:00:45Z"}}'::jsonb,
    '{"progression":{"phase":"NINE_CARD_INITIAL_DEAL_ALL_SEATS"},"timing":{"presentationReadyAt":"2026-10-06T00:00:45Z"}}'::jsonb,
    '{"progression":{"phase":"NINE_CARD_REMAINING_DEAL"},"timing":{"presentationReadyAt":"2026-10-06T00:00:45Z"}}'::jsonb
  ] loop
    if private.derive_game_next_wakeup_internal(v_state, 'active', v_now) is distinct from v_ready then raise exception 'Presentation wake must equal durable boundary'; end if;
    if private.derive_game_next_wakeup_internal(v_state, 'complete', v_now) is not null then raise exception 'Terminal game must not wake'; end if;
  end loop;
end;
$$;
rollback;
