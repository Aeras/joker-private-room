-- Global invariant: one human may occupy at most one waiting/active game,
-- regardless of game type. Same per-player advisory lock for JOKER and DURAK.
-- Applied after DURAK storage migration.
create or replace function private.ensure_single_open_room_internal()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
begin
  if new.occupant_type <> 'human' or new.player_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.player_id::text, 20261009));
  if exists (
    select 1 from public.room_seats s join public.rooms r on r.id=s.room_id
    where s.player_id=new.player_id and s.occupant_type='human'
      and s.room_id<>new.room_id and r.status='lobby'
  ) or exists (
    select 1 from public.game_participants gp join public.games g on gp.game_id=g.id
    where gp.player_id=new.player_id and gp.owner_type='human' and gp.status='active'
      and g.room_id<>new.room_id
  ) or exists (
    select 1 from public.durak_room_seats ds join public.durak_rooms dr on ds.room_id=dr.id
    where ds.player_id=new.player_id and ds.occupant_type='human'
      and dr.lifecycle in ('waiting','playing')
  ) then
    raise exception 'ACTIVE_GAME_EXISTS' using errcode = '23505';
  end if;
  return new;
end;
$$;

create or replace function private.durak_enforce_global_one_game()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private as $$
begin
  if new.occupant_type <> 'human' or new.player_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.player_id::text, 20261009));
  if exists (
    select 1 from public.durak_room_seats ds join public.durak_rooms dr on dr.id=ds.room_id
    where ds.player_id=new.player_id and ds.occupant_type='human'
      and ds.room_id<>new.room_id and dr.lifecycle in ('waiting','playing')
  ) or exists (
    select 1 from public.room_seats s join public.rooms r on r.id=s.room_id
    where s.player_id=new.player_id and s.occupant_type='human' and r.status='lobby'
  ) or exists (
    select 1 from public.game_participants gp join public.games g on g.id=gp.game_id
    where gp.player_id=new.player_id and gp.owner_type='human' and gp.status='active'
  ) then
    raise exception 'ACTIVE_GAME_EXISTS' using errcode='23505';
  end if;
  return new;
end;
$$;
drop trigger if exists durak_global_one_game on public.durak_room_seats;
create trigger durak_global_one_game
before insert or update of occupant_type, player_id on public.durak_room_seats
for each row execute function private.durak_enforce_global_one_game();
revoke all on function private.durak_enforce_global_one_game() from public,anon,authenticated;
