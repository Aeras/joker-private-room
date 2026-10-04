-- JK-005: keep public.games.completed_at consistent with canonical completion.

create or replace function private.set_game_completed_at_internal()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private
as $$
begin
  if new.lifecycle = 'complete'
     and old.lifecycle is distinct from 'complete'
     and new.completed_at is null then
    select h.completed_at
    into new.completed_at
    from public.game_history h
    where h.game_id = new.id;

    new.completed_at := coalesce(new.completed_at, now());
  end if;

  return new;
end;
$$;

revoke all on function private.set_game_completed_at_internal() from public, anon, authenticated;
grant execute on function private.set_game_completed_at_internal() to service_role;

drop trigger if exists set_game_completed_at_on_completion on public.games;
create trigger set_game_completed_at_on_completion
before update of lifecycle on public.games
for each row
execute function private.set_game_completed_at_internal();

update public.games g
set completed_at = h.completed_at
from public.game_history h
where h.game_id = g.id
  and g.lifecycle = 'complete'
  and g.completed_at is null;
