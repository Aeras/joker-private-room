-- Dedicated disposable CI database; no production sessions or identities.
create role anon;
create role authenticated;
create role service_role;
create schema private;
create schema extensions;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table public.games(id uuid primary key,lifecycle text not null,state_version bigint not null);
create table public.game_participants(game_id uuid references public.games(id),seat_index smallint,player_id uuid,owner_type text,status text);
create function public.validate_player_session_internal(token text) returns table(id uuid) language sql as $$
  select case token when repeat('a',64) then '00000000-0000-4000-8000-000000000301'::uuid when repeat('b',64) then '00000000-0000-4000-8000-000000000302'::uuid end where token in(repeat('a',64),repeat('b',64));
$$;
