-- JK-006: authoritative public table roster for AI banter.
-- Returns only current participants in this game; no hidden cards or private state.

create or replace function public.get_dialogue_table_context_internal(
  p_session_token text,
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_participants jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not exists (
    select 1
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status in ('active', 'completed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'seat', gp.seat_index,
      'kind', gp.owner_type,
      'displayName', case
        when gp.owner_type = 'human' then p.display_name
        else gp.bot_display_name
      end,
      'botId', case when gp.owner_type = 'bot' then gp.bot_id else null end
    ))
    order by gp.seat_index
  ), '[]'::jsonb)
  into v_participants
  from public.game_participants gp
  left join public.players p on p.id = gp.player_id
  where gp.game_id = p_game_id
    and gp.status in ('active', 'completed')
    and gp.owner_type in ('human', 'bot');

  return jsonb_build_object('ok', true, 'participants', v_participants);
end;
$$;

revoke all on function public.get_dialogue_table_context_internal(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_dialogue_table_context_internal(text, uuid)
  to service_role;
