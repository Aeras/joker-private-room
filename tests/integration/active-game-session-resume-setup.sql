-- Disposable database only. Never execute this fixture setup on production.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.players(id uuid primary key,display_name text not null,is_host boolean not null default false,is_active boolean not null default true,pin_hash text,updated_at timestamptz not null default now());
create table private.player_credentials(player_id uuid primary key references public.players(id),pin_hash text not null,updated_at timestamptz not null default now());
create table private.test_active_game_ownership(player_id uuid primary key,active boolean not null);
create function private.active_game_for_player_internal(player uuid) returns jsonb language sql as $$
 select jsonb_build_object('gameId','fixture-owned-game') from private.test_active_game_ownership where player_id=player and active;
$$;
