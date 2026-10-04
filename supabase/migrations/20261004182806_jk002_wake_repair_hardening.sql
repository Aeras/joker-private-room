-- Reuse the canonical wake derivation; repair transport metadata only.
create or replace function private.repair_game_wakeups_internal(p_limit integer default 32)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_count integer;
begin
  with candidates as (
    select g.id,
      private.derive_game_next_wakeup_internal(g.canonical_state, g.lifecycle, statement_timestamp()) as expected_wake
    from public.games g
    where (g.lifecycle = 'complete' and g.next_wakeup_at is not null)
       or (g.lifecycle in ('starting','active') and (
         g.next_wakeup_at is null
         or (g.canonical_state#>>'{timing,currentHumanDeadline}' is not null
             and g.canonical_state#>>array['seats',g.canonical_state#>>'{progression,currentActorSeat}','controller'] = 'human'
             and g.next_wakeup_at is distinct from private.derive_game_next_wakeup_internal(g.canonical_state,g.lifecycle,statement_timestamp()))
         or (g.next_wakeup_at > statement_timestamp()
             and private.derive_game_next_wakeup_internal(g.canonical_state,g.lifecycle,statement_timestamp()) <= statement_timestamp())
       ))
    order by g.id
    for update of g skip locked
    limit greatest(1,least(coalesce(p_limit,32),128))
  ), repaired as (
    update public.games g set next_wakeup_at = c.expected_wake
    from candidates c where g.id=c.id returning g.id
  ) select count(*) into v_count from repaired;
  return v_count;
end;
$$;
revoke all on function private.repair_game_wakeups_internal(integer) from public,anon,authenticated;
grant execute on function private.repair_game_wakeups_internal(integer) to service_role;
revoke all on function private.valid_game_reconciliation_claim_internal(uuid,uuid) from public,anon,authenticated;
grant execute on function private.valid_game_reconciliation_claim_internal(uuid,uuid) to service_role;

create or replace function private.dispatch_game_reconciler_internal()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_endpoint text; v_token uuid; v_request_id bigint;
begin
  select endpoint_url into v_endpoint from private.game_reconciler_scheduler_config
  where singleton is true and enabled is true;
  if v_endpoint is null then return null; end if;
  if v_endpoint !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/game-reconciler$' then
    raise exception 'Invalid game reconciler endpoint';
  end if;
  perform private.repair_game_wakeups_internal(32);
  v_token := public.issue_game_reconciler_invocation_internal();
  select net.http_post(url:=v_endpoint,body:=jsonb_build_object('invocationToken',v_token::text),
    headers:=jsonb_build_object('Content-Type','application/json'),timeout_milliseconds:=5000)
  into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_game_reconciler_internal() from public,anon,authenticated;
grant execute on function private.dispatch_game_reconciler_internal() to service_role;
