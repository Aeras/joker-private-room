-- Private, short-lived visual reactions; independent of AI dialogue and gameplay.
create table if not exists private.emoji_reactions (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null,
  seat_index smallint not null check (seat_index between 0 and 3),
  emoji_slug text not null check (emoji_slug ~ '^[a-z0-9_-]{1,64}$'),
  created_at timestamptz not null default now(),
  primary key (game_id, player_id)
);
alter table private.emoji_reactions enable row level security;
revoke all on private.emoji_reactions from public, anon, authenticated;
grant all on private.emoji_reactions to service_role;

create or replace function public.send_emoji_reaction_internal(
  p_session_token text, p_game_id uuid, p_emoji_slug text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare
  v_player_id uuid;
  v_seat smallint;
  v_now timestamptz := clock_timestamp();
  v_allowed text[] := array[
    'grinning_face','grinning_squinting_face','grinning_face_with_big_eyes',
    'smiling_face_with_smiling_eyes','slightly_smiling_face','winking_face',
    'smirking_face','face_with_tears_of_joy','rolling_on_the_floor_laughing',
    'thinking_face','zany_face','face_with_tongue','winking_face_with_tongue',
    'smiling_face_with_heart-eyes','loudly_crying_face','pleading_face',
    'angry_face','pouting_face','confused_face','expressionless_face',
    'unamused_face','face_with_rolling_eyes','sleeping_face',
    'face_screaming_in_fear','star-struck','hugging_face',
    'face_with_open_mouth','face_blowing_a_kiss','smiling_face_with_horns',
    'shushing_face','face_with_hand_over_mouth','relieved_face'
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

create or replace function public.list_emoji_reactions_internal(
  p_session_token text, p_game_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp as $$
declare
  v_player_id uuid;
  v_reactions jsonb;
begin
  select v.id into v_player_id from public.validate_player_session_internal(p_session_token) v limit 1;
  if v_player_id is null then return jsonb_build_object('ok',false,'code','NOT_AUTHENTICATED'); end if;
  if not exists (
    select 1 from public.game_participants gp
    where gp.game_id = p_game_id and gp.owner_type = 'human'
      and gp.player_id = v_player_id and gp.status in ('active','completed')
  ) then return jsonb_build_object('ok',false,'code','GAME_NOT_FOUND'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seat',r.seat_index,'emoji',r.emoji_slug,'createdAt',r.created_at,
    'expiresAt',r.created_at + interval '2 seconds'
  ) order by r.created_at), '[]'::jsonb) into v_reactions
  from private.emoji_reactions r
  where r.game_id = p_game_id and r.created_at > clock_timestamp() - interval '2 seconds';
  return jsonb_build_object('ok',true,'reactions',v_reactions);
end;
$$;
revoke all on function public.send_emoji_reaction_internal(text,uuid,text) from public,anon,authenticated;
revoke all on function public.list_emoji_reactions_internal(text,uuid) from public,anon,authenticated;
grant execute on function public.send_emoji_reaction_internal(text,uuid,text) to service_role;
grant execute on function public.list_emoji_reactions_internal(text,uuid) to service_role;
