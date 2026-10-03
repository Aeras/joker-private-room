create extension if not exists pgcrypto;

alter table public.players add column if not exists pin_hash text;
alter table public.players enable row level security;
revoke all on table public.players from anon, authenticated;

drop function if exists public.list_active_players();
create function public.list_active_players()
returns table(id uuid, display_name text, is_host boolean)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.is_host
  from public.players p
  where p.is_active = true
  order by p.created_at;
$$;

drop function if exists public.verify_player_pin(uuid, text);
create function public.verify_player_pin(p_player_id uuid, p_pin text)
returns table(id uuid, display_name text, is_host boolean)
language sql
security definer
set search_path = public, extensions
as $$
  select p.id, p.display_name, p.is_host
  from public.players p
  where p.id = p_player_id
    and p.is_active = true
    and p.pin_hash is not null
    and p.pin_hash = crypt(p_pin, p.pin_hash)
  limit 1;
$$;

revoke all on function public.list_active_players() from public;
revoke all on function public.verify_player_pin(uuid, text) from public;
grant execute on function public.list_active_players() to anon, authenticated;
grant execute on function public.verify_player_pin(uuid, text) to anon, authenticated;
