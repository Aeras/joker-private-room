-- JK-006 dialogue diversity: retain only a small public-text memory window for
-- anti-repetition. This is not gameplay history and contains no private cards/auth data.

alter table private.dialogue_runtime_state
  add column if not exists recent_lines jsonb not null default '[]'::jsonb;

alter table private.dialogue_runtime_state
  drop constraint if exists dialogue_runtime_recent_lines_check;

alter table private.dialogue_runtime_state
  add constraint dialogue_runtime_recent_lines_check
  check (jsonb_typeof(recent_lines) = 'array' and jsonb_array_length(recent_lines) <= 12);

create or replace function private.capture_dialogue_recent_line_internal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_appended jsonb;
  v_tail jsonb;
begin
  insert into private.dialogue_runtime_state(game_id)
  values (new.game_id)
  on conflict (game_id) do nothing;

  select recent_lines || jsonb_build_array(jsonb_build_object(
    'speakerBotId', left(new.speaker_bot_id, 64),
    'text', left(new.message_text, 100),
    'source', new.source,
    'createdAt', new.created_at
  ))
  into v_appended
  from private.dialogue_runtime_state
  where game_id = new.game_id
  for update;

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into v_tail
  from (
    select item, ord
    from jsonb_array_elements(v_appended) with ordinality as e(item, ord)
    order by ord desc
    limit 12
  ) latest;

  update private.dialogue_runtime_state
  set recent_lines = v_tail,
      updated_at = now()
  where game_id = new.game_id;

  return new;
end;
$$;

revoke all on function private.capture_dialogue_recent_line_internal()
  from public, anon, authenticated;

drop trigger if exists dialogue_capture_recent_line on private.dialogue_messages;
create trigger dialogue_capture_recent_line
after insert or update of message_text on private.dialogue_messages
for each row execute function private.capture_dialogue_recent_line_internal();

create or replace function public.get_dialogue_recent_context_internal(
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
  v_recent jsonb;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.owner_type = 'human'
      and gp.player_id = v_player_id
      and gp.status in ('active', 'completed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  select coalesce(drs.recent_lines, '[]'::jsonb)
  into v_recent
  from private.dialogue_runtime_state drs
  where drs.game_id = p_game_id;

  return jsonb_build_object('ok', true, 'messages', coalesce(v_recent, '[]'::jsonb));
end;
$$;

revoke all on function public.get_dialogue_recent_context_internal(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_dialogue_recent_context_internal(text, uuid)
  to service_role;
