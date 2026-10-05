create or replace function public.get_game_table_readiness_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.get_game_table_readiness_internal(p_session_token, p_game_id);
$$;

create or replace function public.set_game_table_ready_internal(
  p_session_token text,
  p_game_id uuid,
  p_ready boolean
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.set_game_table_ready_internal(p_session_token, p_game_id, p_ready);
$$;

create or replace function public.authorize_game_start_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.authorize_game_start_internal(p_session_token, p_game_id);
$$;

create or replace function public.mark_game_start_presentation_complete_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.mark_game_start_presentation_complete_internal(p_session_token, p_game_id);
$$;

revoke all on function public.get_game_table_readiness_internal(text, uuid) from public, anon, authenticated;
revoke all on function public.set_game_table_ready_internal(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.authorize_game_start_internal(text, uuid) from public, anon, authenticated;
revoke all on function public.mark_game_start_presentation_complete_internal(text, uuid) from public, anon, authenticated;

grant execute on function public.get_game_table_readiness_internal(text, uuid) to service_role;
grant execute on function public.set_game_table_ready_internal(text, uuid, boolean) to service_role;
grant execute on function public.authorize_game_start_internal(text, uuid) to service_role;
grant execute on function public.mark_game_start_presentation_complete_internal(text, uuid) to service_role;
