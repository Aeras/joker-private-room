create table if not exists private.game_reconciler_scheduler_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  endpoint_url text,
  updated_at timestamptz not null default now()
);

insert into private.game_reconciler_scheduler_config(singleton, enabled, endpoint_url)
values (true, false, null)
on conflict (singleton) do nothing;

revoke all on private.game_reconciler_scheduler_config from public, anon, authenticated;
grant select, update on private.game_reconciler_scheduler_config to service_role;

create or replace function private.dispatch_game_reconciler_internal()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_endpoint text;
  v_token uuid;
  v_request_id bigint;
begin
  select endpoint_url
  into v_endpoint
  from private.game_reconciler_scheduler_config
  where singleton is true
    and enabled is true;

  if v_endpoint is null then
    return null;
  end if;

  if v_endpoint !~ '^https://[a-z0-9-]+[.]supabase[.]co/functions/v1/game-reconciler$' then
    raise exception 'Invalid game reconciler endpoint';
  end if;

  v_token := public.issue_game_reconciler_invocation_internal();

  select net.http_post(
    url := v_endpoint,
    body := jsonb_build_object('invocationToken', v_token::text),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.dispatch_game_reconciler_internal() from public, anon, authenticated;
grant execute on function private.dispatch_game_reconciler_internal() to service_role;

DO $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'jk002-game-reconciler';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'jk002-game-reconciler',
    '10 seconds',
    'select private.dispatch_game_reconciler_internal();'
  );
end;
$$;
