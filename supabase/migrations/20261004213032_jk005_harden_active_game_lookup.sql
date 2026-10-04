-- JK-005: harden active-game ownership against stale participant rows.

update public.game_participants gp
set status = 'completed'
from public.games g
where g.id = gp.game_id
  and g.lifecycle = 'complete'
  and gp.status = 'active';

create or replace function private.active_game_for_player_internal(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object('gameId', g.id, 'roomCode', r.code)
  from public.game_participants gp
  join public.games g on g.id = gp.game_id
  join public.rooms r on r.id = g.room_id
  where gp.player_id = p_player_id
    and gp.owner_type = 'human'
    and gp.status = 'active'
    and g.lifecycle in ('starting', 'active')
  order by g.created_at desc
  limit 1;
$$;
