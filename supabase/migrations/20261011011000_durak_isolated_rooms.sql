-- Isolated DURAK room persistence. No alteration to JOKER rooms, games or rules.
-- This migration intentionally creates storage only; mutations require separate
-- server-authoritative RPCs validating the existing httpOnly player session.
create table if not exists public.durak_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_player_id uuid not null references public.players(id),
  variant text not null check (variant in ('podkidnoy','perevodnoy')),
  capacity smallint not null check (capacity between 2 and 6),
  lifecycle text not null default 'waiting' check (lifecycle in ('waiting','playing','finished','cancelled')),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.durak_room_seats (
  room_id uuid not null references public.durak_rooms(id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 5),
  occupant_type text not null default 'empty' check (occupant_type in ('empty','human','bot')),
  player_id uuid references public.players(id),
  bot_id text,
  bot_display_name text,
  primary key (room_id,seat_index),
  constraint durak_seat_occupant_consistency check (
    (occupant_type='empty' and player_id is null and bot_id is null and bot_display_name is null)
    or (occupant_type='human' and player_id is not null and bot_id is null and bot_display_name is null)
    or (occupant_type='bot' and player_id is null and bot_id is not null and bot_display_name is not null)
  ),
  constraint durak_bot_name_nonblank check (bot_display_name is null or length(trim(bot_display_name))>0)
);
create unique index if not exists durak_one_human_per_room on public.durak_room_seats(room_id,player_id) where player_id is not null;
create unique index if not exists durak_one_bot_per_room on public.durak_room_seats(room_id,bot_id) where bot_id is not null;
create index if not exists durak_waiting_rooms_recent on public.durak_rooms(created_at desc) where lifecycle='waiting';
create index if not exists durak_human_seats on public.durak_room_seats(player_id) where player_id is not null;

-- App authentication is a private signed session, not a Supabase Auth JWT.
-- No direct client access; future server RPC endpoints use service_role and
-- verify the signed session on EVERY command.
alter table public.durak_rooms enable row level security;
alter table public.durak_room_seats enable row level security;
revoke all on public.durak_rooms from public, anon, authenticated;
revoke all on public.durak_room_seats from public, anon, authenticated;
grant select,insert,update,delete on public.durak_rooms to service_role;
grant select,insert,update,delete on public.durak_room_seats to service_role;

-- Ensure every seat fits its room's declared capacity, including direct service writes.
create or replace function private.durak_validate_seat_index()
returns trigger language plpgsql
set search_path = pg_catalog, public, private
as $$
declare v_capacity integer;
begin
  select capacity into v_capacity from public.durak_rooms where id=new.room_id for update;
  if v_capacity is null or new.seat_index >= v_capacity then
    raise exception 'INVALID_DURAK_SEAT_INDEX' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists durak_seat_capacity_check on public.durak_room_seats;
create trigger durak_seat_capacity_check
before insert or update of room_id,seat_index on public.durak_room_seats
for each row execute function private.durak_validate_seat_index();
revoke all on function private.durak_validate_seat_index() from public,anon,authenticated;
