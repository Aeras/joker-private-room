-- Isolated simulation data. No writes/references to real rooms, games or scores.
create table if not exists private.bot_lab_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null check(owner_id='a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'),
  request_id uuid not null unique,
  config jsonb not null,
  engine_version text not null default 'lab-engine-v1',
  status text not null default 'queued' check(status in ('queued','running','completed','cancelled','failed')),
  total_games integer not null check(total_games between 10 and 10000),
  completed_games integer not null default 0 check(completed_games>=0 and completed_games<=total_games),
  started_games integer not null default 0 check(started_games>=completed_games and started_games<=total_games),
  game_started boolean not null default false,
  checkpoint jsonb check(checkpoint is null or (jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text)<=1000000)),
  lease_token uuid, lease_until timestamptz,
  chunks integer not null default 0 check(chunks between 0 and 500000),
  recoveries integer not null default 0, errors integer not null default 0, rejected_actions integer not null default 0,
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  check((lease_token is null)=(lease_until is null)),
  check((status in ('completed','cancelled','failed'))=(completed_at is not null)),
  check(status<>'completed' or completed_games=total_games)
);
create unique index if not exists bot_lab_one_active_job on private.bot_lab_jobs((true)) where status in ('queued','running');
create index if not exists bot_lab_history on private.bot_lab_jobs(created_at desc);
create table if not exists private.bot_lab_results (
  job_id uuid not null references private.bot_lab_jobs(id), game_index integer not null check(game_index>=0 and game_index<10000),
  result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=65536),
  primary key(job_id,game_index)
);
create table if not exists private.bot_lab_scheduler_config (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false,
  endpoint_url text not null default 'https://wubrgnzbvtrzbvvqalfw.supabase.co/functions/v1/bot-lab-worker'
    check(endpoint_url='https://wubrgnzbvtrzbvvqalfw.supabase.co/functions/v1/bot-lab-worker')
);
insert into private.bot_lab_scheduler_config(singleton) values(true) on conflict do nothing;
create table if not exists private.bot_lab_invocations (token uuid primary key default gen_random_uuid(),expires_at timestamptz not null default now()+interval '30 seconds');
alter table private.bot_lab_jobs enable row level security;
alter table private.bot_lab_results enable row level security;
alter table private.bot_lab_scheduler_config enable row level security;
alter table private.bot_lab_invocations enable row level security;
revoke all on private.bot_lab_jobs,private.bot_lab_results,private.bot_lab_scheduler_config,private.bot_lab_invocations from public,anon,authenticated,service_role;
-- Definer RPCs own all data access; service clients cannot directly edit simulation records.
grant select,update on private.bot_lab_scheduler_config to service_role;

create or replace function private.bot_lab_job_json(j private.bot_lab_jobs) returns jsonb language sql stable set search_path=pg_catalog as $$
 select (to_jsonb(j)-'checkpoint'-'lease_token'-'lease_until') || jsonb_build_object('currentDeal',j.checkpoint#>'{state,progression,dealNumber}','currentStep',j.checkpoint->'steps');
$$;
revoke all on function private.bot_lab_job_json(private.bot_lab_jobs) from public,anon,authenticated;

create or replace function private.dispatch_bot_lab_internal() returns bigint language plpgsql security definer set search_path=pg_catalog as $$
declare c private.bot_lab_scheduler_config; t uuid; request_id bigint;
begin
 select * into c from private.bot_lab_scheduler_config where singleton and enabled for update skip locked;
 if not found then return null; end if;
 if not exists(select 1 from private.bot_lab_jobs where status in ('queued','running') and (lease_until is null or lease_until<=clock_timestamp())) then return null; end if;
 delete from private.bot_lab_invocations where expires_at<=clock_timestamp();
 if exists(select 1 from private.bot_lab_invocations) then return null; end if;
 insert into private.bot_lab_invocations default values returning token into t;
 select net.http_post(url:=c.endpoint_url,body:=jsonb_build_object('invocationToken',t),headers:=jsonb_build_object('Content-Type','application/json'),timeout_milliseconds:=5000) into request_id;
 return request_id;
end;
$$;
revoke all on function private.dispatch_bot_lab_internal() from public,anon,authenticated;

create or replace function public.bot_lab_admin_internal(p_session_token text,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare player uuid; j private.bot_lab_jobs; cfg jsonb; n integer; rid uuid; target uuid;
begin
 select id into player from public.validate_player_session_internal(p_session_token);
 if player is distinct from 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_action='access' then return jsonb_build_object('allowed',true); end if;
 if p_action='list' then
   return jsonb_build_object('jobs',(select coalesce(jsonb_agg(private.bot_lab_job_json(x) order by x.created_at desc),'[]'::jsonb) from (select * from private.bot_lab_jobs where owner_id=player order by created_at desc limit 30) x),'workerEnabled',(select enabled from private.bot_lab_scheduler_config where singleton));
 end if;
 if p_action='create' then
   cfg:=p_payload->'config'; rid:=(p_payload->>'requestId')::uuid;
   if rid is null or jsonb_typeof(cfg) is distinct from 'object' or jsonb_typeof(cfg->'games') is distinct from 'number' or jsonb_typeof(cfg->'seed') is distinct from 'number' or (cfg->>'games')::integer not in (10,100,1000,5000) or (cfg->>'seed')::bigint not between 0 and 4294966045 or cfg->>'ruleset' not in ('popular','classic','minus','panagiotis') or jsonb_typeof(cfg->'compare')<>'boolean' or not (cfg->'lineup'='null'::jsonb or (jsonb_typeof(cfg->'lineup')='array' and jsonb_array_length(cfg->'lineup')=4 and not exists(select 1 from jsonb_array_elements_text(cfg->'lineup') t where t is null or t not in ('strong-basic-v1','memory-inference-v1','probability-simulation-v1'))))
     or not (cfg ?& array['games','seed','ruleset','compare','lineup']) then raise exception 'INVALID_CONFIG'; end if;
   select * into j from private.bot_lab_jobs where request_id=rid;
   if found then if j.config<>cfg then raise exception 'ACTION_ID_CONFLICT'; end if; return private.bot_lab_job_json(j); end if;
   if not exists(select 1 from private.bot_lab_scheduler_config where singleton and enabled) then raise exception 'WORKER_NOT_CONFIGURED'; end if;
   n:=(cfg->>'games')::integer * case when (cfg->>'compare')::boolean then 2 else 1 end;
   insert into private.bot_lab_jobs(owner_id,request_id,config,total_games) values(player,rid,cfg,n) returning * into j;
   perform private.dispatch_bot_lab_internal();
   return private.bot_lab_job_json(j);
 end if;
 target:=(p_payload->>'jobId')::uuid;
 select * into j from private.bot_lab_jobs where id=target and owner_id=player;
 if not found then raise exception 'JOB_NOT_FOUND'; end if;
 if p_action='get' then return private.bot_lab_job_json(j); end if;
 if p_action='cancel' then
   update private.bot_lab_jobs set status='cancelled',completed_at=clock_timestamp(),updated_at=clock_timestamp(),lease_token=null,lease_until=null where id=target and status in ('queued','running') returning * into j;
   if not found then select * into j from private.bot_lab_jobs where id=target; end if;
   return private.bot_lab_job_json(j);
 end if;
 if p_action='results' then
   n:=coalesce((p_payload->>'offset')::integer,0); if n<0 or n>10000 then raise exception 'INVALID_OFFSET'; end if;
   return jsonb_build_object('results',(select coalesce(jsonb_agg(to_jsonb(x) order by game_index),'[]'::jsonb) from (select game_index,result from private.bot_lab_results where job_id=target and game_index>=n order by game_index limit 20) x));
 end if;
 raise exception 'INVALID_ACTION';
end;
$$;
revoke all on function public.bot_lab_admin_internal(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.bot_lab_admin_internal(text,text,jsonb) to service_role;

create or replace function public.claim_bot_lab_internal(p_invocation_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare j private.bot_lab_jobs; t uuid;
begin
 delete from private.bot_lab_invocations where token=p_invocation_token and expires_at>clock_timestamp() returning token into t;
 if t is null then raise exception 'INVALID_WORKER_TOKEN' using errcode='42501'; end if;
 if not exists(select 1 from private.bot_lab_scheduler_config where singleton and enabled) then return null; end if;
 select * into j from private.bot_lab_jobs where status in ('queued','running') and (lease_until is null or lease_until<=clock_timestamp()) order by created_at limit 1 for update skip locked;
 if not found then return null; end if;
 if j.chunks>=500000 or j.created_at<clock_timestamp()-interval '14 days' then
   update private.bot_lab_jobs set status='failed',completed_at=clock_timestamp(),lease_token=null,lease_until=null,last_error='JOB_BUDGET',errors=errors+1 where id=j.id; return null;
 end if;
 update private.bot_lab_jobs set status='running',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',chunks=chunks+1,recoveries=recoveries+case when lease_token is not null then 1 else 0 end,started_games=started_games+case when game_started then 0 else 1 end,game_started=true,updated_at=clock_timestamp() where id=j.id returning * into j;
 return to_jsonb(j);
end;
$$;
revoke all on function public.claim_bot_lab_internal(uuid) from public,anon,authenticated;
grant execute on function public.claim_bot_lab_internal(uuid) to service_role;

create or replace function public.commit_bot_lab_chunk_internal(p_job_id uuid,p_lease_token uuid,p_game_index integer,p_checkpoint jsonb,p_result jsonb,p_error text default null) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare j private.bot_lab_jobs;
begin
 select * into j from private.bot_lab_jobs where id=p_job_id for update;
 if not found or j.status<>'running' or j.lease_token is distinct from p_lease_token or j.lease_until<=clock_timestamp() or j.completed_games<>p_game_index then return false; end if;
 if p_error is not null then
   update private.bot_lab_jobs set status='failed',completed_at=clock_timestamp(),lease_token=null,lease_until=null,errors=errors+1,rejected_actions=rejected_actions+case when p_error='REJECTED_ACTION' then 1 else 0 end,last_error=left(p_error,80),updated_at=clock_timestamp() where id=j.id; return true;
 end if;
 if p_result is not null then
   if p_checkpoint is not null or jsonb_typeof(p_result->'scores') is distinct from 'array' or jsonb_typeof(p_result->'metrics') is distinct from 'array' or jsonb_array_length(p_result->'scores')<>4 or jsonb_array_length(p_result->'metrics')<>4 or p_result->'config'->>'ruleset' is distinct from j.config->>'ruleset' then raise exception 'INVALID_RESULT'; end if;
   insert into private.bot_lab_results(job_id,game_index,result) values(j.id,p_game_index,p_result);
   update private.bot_lab_jobs set completed_games=completed_games+1,checkpoint=null,game_started=false,status=case when completed_games+1=total_games then 'completed' else 'running' end,completed_at=case when completed_games+1=total_games then clock_timestamp() else null end,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
 else
   if p_checkpoint is null or p_checkpoint->>'schema' is distinct from '1' or p_checkpoint#>>'{state,gameId}' is distinct from '00000000-0000-4000-8000-00000000b001' then raise exception 'INVALID_CHECKPOINT'; end if;
   update private.bot_lab_jobs set checkpoint=p_checkpoint,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
 end if;
 perform private.dispatch_bot_lab_internal();
 return true;
end;
$$;
revoke all on function public.commit_bot_lab_chunk_internal(uuid,uuid,integer,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.commit_bot_lab_chunk_internal(uuid,uuid,integer,jsonb,jsonb,text) to service_role;

-- Existing JOKER infrastructure already supplies pg_cron and pg_net. Disabled
-- by default: owner must deploy worker and explicitly enable the fixed endpoint.
select cron.schedule('joker-bot-lab','10 seconds','select private.dispatch_bot_lab_internal();');
create or replace function public.bot_lab_stats_internal(p_session_token text,p_job_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare j jsonb; summaries jsonb; comparison jsonb;
begin
 j:=public.bot_lab_admin_internal(p_session_token,'get',jsonb_build_object('jobId',p_job_id));
 with rows as (select m from private.bot_lab_results r cross join lateral jsonb_array_elements(r.result->'metrics') m where r.job_id=p_job_id),
 base as (select m->>'tier' tier,m->>'version' version,count(*) participations,sum((m->>'outright')::integer) outright,sum((m->>'tied')::integer) tied,sum((m->>'winShare')::numeric) win_share,avg((m->>'score')::numeric) mean_score,percentile_cont(0.5) within group(order by (m->>'score')::numeric) median_score,sum((m->>'penalties')::integer) penalties,sum((m->>'penaltyPoints')::integer) penalty_points,sum((m->>'jokerWon')::integer) joker_won,sum((m->>'jokerLost')::integer) joker_lost,sum((m->>'premia')::integer) premia,sum((m->>'bonusPoints')::integer) bonus,sum((m->>'removedPoints')::integer) removed from rows group by m->>'tier',m->>'version'),
 bids as (select m->>'tier' tier,m->>'version' version,e.ordinality n,sum(e.value::integer) exact,sum((m->'under'->>(e.ordinality::integer-1))::integer) under,sum((m->'over'->>(e.ordinality::integer-1))::integer) over_count from rows cross join lateral jsonb_array_elements_text(m->'exact') with ordinality e(value,ordinality) group by m->>'tier',m->>'version',e.ordinality),
 bid_groups as (select tier,version,jsonb_object_agg(n::text,jsonb_build_object('exact',exact,'under',under,'over',over_count,'deals',exact+under+over_count)) counts from bids group by tier,version),
 latency as (select m->>'tier' tier,m->>'version' version,e.ordinality n,sum(e.value::integer) count from rows cross join lateral jsonb_array_elements_text(m->'latencyHistogram') with ordinality e(value,ordinality) group by m->>'tier',m->>'version',e.ordinality),
 latency_groups as (select tier,version,jsonb_agg(count order by n) histogram from latency group by tier,version),
 jokers as (select m->>'tier' tier,m->>'version' version,e.key mode,sum(e.value::integer) count from rows cross join lateral jsonb_each_text(m->'jokerModes') e group by m->>'tier',m->>'version',e.key),
 joker_groups as (select tier,version,jsonb_object_agg(mode,count) modes from jokers group by tier,version)
 select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('exactByDealSize',bg.counts,'latencyHistogram',lg.histogram,'jokerModes',coalesce(jg.modes,'{}'::jsonb)) order by b.version,b.tier),'[]'::jsonb) into summaries from base b left join bid_groups bg using(tier,version) left join latency_groups lg using(tier,version) left join joker_groups jg using(tier,version);
 comparison:=null;
 if (j#>>'{config,compare}')::boolean then
   with pairs as (select b.result before,c.result after from private.bot_lab_results b join private.bot_lab_results c on c.job_id=b.job_id and c.game_index=b.game_index+1 where b.job_id=p_job_id and b.game_index%2=0),
   deltas as (select (before#>>'{config,seed}')::bigint seed,
     ((after->'scores'->>((before#>>'{config,rotation}')::integer))::numeric-(before->'scores'->>((before#>>'{config,rotation}')::integer))::numeric) score_delta,
     (case when (after->'placements'->>((before#>>'{config,rotation}')::integer))::integer=1 then 1.0/(select count(*) from jsonb_array_elements_text(after->'placements') p where p='1') else 0 end - case when (before->'placements'->>((before#>>'{config,rotation}')::integer))::integer=1 then 1.0/(select count(*) from jsonb_array_elements_text(before->'placements') p where p='1') else 0 end) win_delta from pairs),
   clusters as (select seed,avg(score_delta) score_delta,avg(win_delta) win_delta,count(*) pairs from deltas group by seed),
   overall as (select count(*) n,coalesce(sum(pairs),0) matched,avg(score_delta) score_delta,avg(win_delta) win_delta,1.96*stddev_samp(score_delta)/sqrt(count(*)) score_half,1.96*stddev_samp(win_delta)/sqrt(count(*)) win_half from clusters)
   select jsonb_build_object('independentSeeds',n,'matchedGames',matched,'meanScoreDelta',score_delta,'meanWinShareDelta',win_delta,'approximate95ScoreCI',case when n>=30 then jsonb_build_array(score_delta-score_half,score_delta+score_half) else null end,'approximate95WinShareCI',case when n>=30 then jsonb_build_array(win_delta-win_half,win_delta+win_half) else null end) into comparison from overall;
 end if;
 return jsonb_build_object('groups',summaries,'comparison',comparison,'startedGames',j->'started_games','completedGames',j->'completed_games','errors',j->'errors','rejectedActions',j->'rejected_actions','latencyBounds',jsonb_build_array(0.125,0.25,0.5,1,2,4,8,16,32,64,128,256,512,1024,2048),'latencyQuantiles','histogram intervals, not exact individual timings');
end;
$$;
revoke all on function public.bot_lab_stats_internal(text,uuid) from public,anon,authenticated;
grant execute on function public.bot_lab_stats_internal(text,uuid) to service_role;
