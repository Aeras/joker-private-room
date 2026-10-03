drop function if exists public.set_player_pin(uuid, text);
create function public.set_player_pin(p_player_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must contain exactly four digits';
  end if;
  update public.players
  set pin_hash = crypt(p_pin, gen_salt('bf', 10)), updated_at = now()
  where id = p_player_id;
end;
$$;
revoke all on function public.set_player_pin(uuid, text) from public, anon, authenticated;
