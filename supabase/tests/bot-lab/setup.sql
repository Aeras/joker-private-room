-- Disposable test DB only. Real session-validation function is loaded separately.
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.players(id uuid primary key,display_name text,is_host boolean,is_active boolean);
create table private.player_sessions(id uuid primary key default gen_random_uuid(),player_id uuid references public.players(id),token_hash bytea unique,expires_at timestamptz,revoked_at timestamptz,active_control boolean,last_seen_at timestamptz);
create schema net;
create table net.test_outbox(id bigserial,body jsonb);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ declare n bigint; begin insert into net.test_outbox(body) values(body) returning id into n; return n; end; $$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
insert into public.players values ('a1f36a77-1732-44d4-8c3b-4623a6e6ed0c','real admin',true,true),('12302475-c4da-491c-9081-08c039384ac1','ZwaloPutz',true,true);
insert into private.player_sessions(player_id,token_hash,expires_at,active_control) values
('a1f36a77-1732-44d4-8c3b-4623a6e6ed0c',extensions.digest(repeat('a',64),'sha256'),now()+interval '1 day',true),
('12302475-c4da-491c-9081-08c039384ac1',extensions.digest(repeat('b',64),'sha256'),now()+interval '1 day',true),
('a1f36a77-1732-44d4-8c3b-4623a6e6ed0c',extensions.digest(repeat('c',64),'sha256'),now()-interval '1 second',true);