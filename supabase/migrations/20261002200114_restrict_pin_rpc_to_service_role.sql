revoke execute on function public.verify_player_pin(uuid, text) from anon, authenticated;
grant execute on function public.verify_player_pin(uuid, text) to service_role;
revoke execute on function public.set_player_pin(uuid, text) from anon, authenticated;
grant execute on function public.set_player_pin(uuid, text) to service_role;
