-- Switch JOKER avatar reactions to the 20 approved premium assets.
-- Existing transient reactions remain safe to read but are no longer sendable.
create or replace function public.send_emoji_reaction_internal(
  p_session_token text, p_game_id uuid, p_emoji_slug text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare
  v_player_id uuid;
  v_seat smallint;
  v_now timestamptz := clock_timestamp();
  v_allowed text[] := array[
    'wave',
    'laugh',
    'point-laugh',
    'cry',
    'angry',
    'wink',
    'facepalm',
    'thumbs-up',
    'applause',
    'surprised',
    'flirty-wink',
    'kiss',
    'heart-eyes',
    'shrug',
    'celebrate',
    'peekaboo',
    'please',
    'thinking',
    'sleepy',
    'cool'
  ];
begin
  select v.id into v_player_id from public.validate_player_session_internal(p_session_token) v limit 1;
  if v_player_id is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  if p_emoji_slug is null or not (p_emoji_slug = any(v_allowed)) then
    return jsonb_build_object('ok',false,'code','INVALID_EMOJI');
  end if;
  select gp.seat_index into v_seat
  from public.game_participants gp join public.games g on g.id = gp.game_id
  where gp.game_id = p_game_id and gp.owner_type = 'human'
    and gp.player_id = v_player_id and gp.status = 'active'
    and g.lifecycle = 'active'
  limit 1;
  if v_seat is null then return jsonb_build_object('ok',false,'code','GAME_NOT_FOUND'); end if;

  insert into private.emoji_reactions(game_id,player_id,seat_index,emoji_slug,created_at)
  values(p_game_id,v_player_id,v_seat,p_emoji_slug,v_now)
  on conflict (game_id,player_id) do update
    set emoji_slug = excluded.emoji_slug,
        seat_index = excluded.seat_index,
        created_at = excluded.created_at
    where private.emoji_reactions.created_at <= v_now - interval '2 seconds';
  if not found then return jsonb_build_object('ok',false,'code','RATE_LIMITED'); end if;
  return jsonb_build_object('ok',true,'reaction',jsonb_build_object(
    'seat',v_seat,'emoji',p_emoji_slug,'createdAt',v_now,
    'expiresAt',v_now + interval '2 seconds'));
end;
$$;
