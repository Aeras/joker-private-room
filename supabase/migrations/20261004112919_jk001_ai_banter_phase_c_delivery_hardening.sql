create or replace function public.publish_dialogue_message_internal(
  p_session_token text,
  p_game_id uuid,
  p_event_id text,
  p_speaker_bot_id text,
  p_target_seat smallint,
  p_message_text text,
  p_source text,
  p_reply_depth smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_row private.dialogue_messages%rowtype;
  v_current_state_version bigint;
  v_event_state_version bigint;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;
  if v_player_id is null then return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); end if;
  if p_message_text is null or char_length(trim(p_message_text)) not between 1 and 100 or p_source not in ('preset', 'gemini') or p_reply_depth not between 0 and 1 or (p_target_seat is not null and p_target_seat not between 0 and 3) then return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_MESSAGE'); end if;
  select g.state_version into v_current_state_version from public.games g join public.game_participants gp on gp.game_id = g.id where g.id = p_game_id and gp.owner_type = 'human' and gp.player_id = v_player_id and gp.status in ('active', 'completed') limit 1;
  if v_current_state_version is null then return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND'); end if;
  if not exists (select 1 from public.game_participants gp where gp.game_id=p_game_id and gp.owner_type='bot' and gp.bot_id=p_speaker_bot_id and gp.status in ('active','completed')) then return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_TARGET'); end if;
  if not exists (select 1 from private.dialogue_event_claims c where c.game_id=p_game_id and c.event_id=p_event_id and c.expires_at>now()) then return jsonb_build_object('ok', false, 'code', 'DIALOGUE_EVENT_NOT_CLAIMED'); end if;
  if p_event_id ~ '^state-[0-9]+:' then v_event_state_version := substring(p_event_id from '^state-([0-9]+):')::bigint; if v_current_state_version > v_event_state_version + 1 then return jsonb_build_object('ok', false, 'code', 'STALE_DIALOGUE_RESULT'); end if; end if;
  delete from private.dialogue_messages where game_id=p_game_id and expires_at<=now();
  if exists (select 1 from private.dialogue_messages m where m.game_id=p_game_id and m.expires_at>now() and lower(trim(m.message_text))=lower(trim(p_message_text))) then return jsonb_build_object('ok', false, 'code', 'DUPLICATE_DIALOGUE_LINE'); end if;
  insert into private.dialogue_messages(game_id,event_id,speaker_bot_id,target_seat,message_text,source,reply_depth) values(p_game_id,p_event_id,p_speaker_bot_id,p_target_seat,trim(p_message_text),p_source,p_reply_depth)
  on conflict (game_id,event_id,speaker_bot_id) do update set target_seat=excluded.target_seat,message_text=excluded.message_text,source=excluded.source,reply_depth=excluded.reply_depth,created_at=now(),expires_at=now()+interval '8 seconds' returning * into v_row;
  return jsonb_build_object('ok', true, 'message', jsonb_build_object('id',v_row.id,'eventId',v_row.event_id,'speakerBotId',v_row.speaker_bot_id,'targetSeat',v_row.target_seat,'text',v_row.message_text,'source',v_row.source,'replyDepth',v_row.reply_depth,'createdAt',v_row.created_at,'expiresAt',v_row.expires_at));
end;
$$;
revoke all on function public.publish_dialogue_message_internal(text, uuid, text, text, smallint, text, text, smallint) from public, anon, authenticated;
grant execute on function public.publish_dialogue_message_internal(text, uuid, text, text, smallint, text, text, smallint) to service_role;
