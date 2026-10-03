create extension if not exists pgcrypto;

create table public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  normalized_name text generated always as (lower(btrim(display_name))) stored unique,
  is_host boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.player_credentials (
  player_id uuid primary key references public.players(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;

insert into public.players (display_name, is_host)
values ('Giobis', true), ('Mixalis', false), ('Git', false);

comment on table public.players is 'Predefined human player identities. Credentials are stored separately.';
comment on table private.player_credentials is 'Server-only hashed player credentials; never expose to client roles.';
