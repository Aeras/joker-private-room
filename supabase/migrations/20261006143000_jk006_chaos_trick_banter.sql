create or replace function public.resolve_dialogue_state_event_internal(
  p_session_token text,
  p_game_id uuid,
  p_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_player_id uuid;
  v_state jsonb;
  v_lifecycle text;
  v_current_state_version bigint;
  v_match text[];
  v_event_state_version bigint;
  v_event_type text;
  v_target_token text;
  v_target_seat integer;
  v_salt integer;
  v_bots text[];
  v_speaker_bot_id text;
  v_cards_per_player integer;
  v_declared integer;
  v_actual integer;
  v_score_delta integer;
  v_owner_type text;
  v_expected_type text;
  v_deal jsonb;
  v_trick jsonb;
  v_premia jsonb;
  v_expected_target integer;
  v_round integer;
  v_deal_number integer;
begin
  select v.id into v_player_id
  from public.validate_player_session_internal(p_session_token) v
  limit 1;

  if v_player_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  end if;

  select g.canonical_state, g.lifecycle, g.state_version
  into v_state, v_lifecycle, v_current_state_version
  from public.games g
  join public.game_participants gp on gp.game_id = g.id
  where g.id = p_game_id
    and gp.owner_type = 'human'
    and gp.player_id = v_player_id
    and gp.status in ('active', 'completed')
  limit 1;

  if v_state is null then
    return jsonb_build_object('ok', false, 'code', 'GAME_NOT_FOUND');
  end if;

  v_match := regexp_match(
    p_event_id,
    '^state-([0-9]+):([A-Z0-9_]+):(all|[0-3]):([0-9]+)$'
  );
  if v_match is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
  end if;

  v_event_state_version := v_match[1]::bigint;
  v_event_type := v_match[2];
  v_target_token := v_match[3];
  v_salt := v_match[4]::integer;
  v_target_seat := case when v_target_token = 'all' then null else v_target_token::integer end;

  -- Banter is non-authoritative and disposable. If gameplay has moved too far,
  -- reject instead of attempting to reconstruct an old transition from history.
  if v_event_state_version > v_current_state_version
     or v_current_state_version > v_event_state_version + 1 then
    return jsonb_build_object('ok', false, 'code', 'STALE_DIALOGUE_EVENT');
  end if;

  select array_agg(gp.bot_id order by gp.seat_index)
  into v_bots
  from public.game_participants gp
  where gp.game_id = p_game_id
    and gp.owner_type = 'bot'
    and gp.bot_id is not null
    and gp.status in ('active', 'completed');

  if coalesce(array_length(v_bots, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_TARGET');
  end if;

  v_speaker_bot_id := v_bots[((v_event_state_version + v_salt) % array_length(v_bots, 1)) + 1];
  v_round := nullif(v_state #>> '{progression,round}', '')::integer;
  v_deal_number := nullif(v_state #>> '{progression,dealNumber}', '')::integer;

  if v_event_type in ('PLAYER_DECLARED_ZERO', 'PLAYER_DECLARED_HIGH') then
    if v_target_seat is null or v_salt <> v_target_seat then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_declared := nullif(v_state #>> array['declarations', 'declarations', v_target_seat::text], '')::integer;
    v_cards_per_player := nullif(v_state #>> '{progression,cardsPerPlayer}', '')::integer;
    if v_declared is null or v_cards_per_player is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    if v_event_type = 'PLAYER_DECLARED_ZERO' and v_declared <> 0 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    if v_event_type = 'PLAYER_DECLARED_HIGH'
       and v_declared < greatest(4, v_cards_per_player - 1) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'event', jsonb_strip_nulls(jsonb_build_object(
        'id', p_event_id,
        'type', v_event_type,
        'createdAt', now(),
        'speakerBotId', v_speaker_bot_id,
        'targetSeat', v_target_seat,
        'declared', v_declared,
        'round', v_round,
        'deal', v_deal_number,
        'replyDepth', 0
      ))
    );
  end if;

  if v_event_type in (
    'PLAYER_HIT_EXACT_BID', 'BOT_HIT_EXACT_BID',
    'PLAYER_GOT_MINUS_200', 'BOT_GOT_MINUS_200',
    'OVERTRICK', 'UNDERTRICK'
  ) then
    if v_target_seat is null or v_salt <> v_target_seat + 10 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_deal := (v_state #> '{score,completedDeals}') -> -1;
    if v_deal is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_declared := nullif(v_deal #>> array['declarations', v_target_seat::text], '')::integer;
    v_actual := nullif(v_deal #>> array['tricksTaken', v_target_seat::text], '')::integer;
    v_score_delta := nullif(v_deal #>> array['dealScores', v_target_seat::text], '')::integer;
    v_owner_type := v_state #>> array['seats', v_target_seat::text, 'owner', 'type'];
    if v_declared is null or v_actual is null or v_score_delta is null or v_owner_type not in ('human', 'bot') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    if v_score_delta = -200 then
      v_expected_type := case when v_owner_type = 'bot' then 'BOT_GOT_MINUS_200' else 'PLAYER_GOT_MINUS_200' end;
    elsif v_declared = v_actual then
      v_expected_type := case when v_owner_type = 'bot' then 'BOT_HIT_EXACT_BID' else 'PLAYER_HIT_EXACT_BID' end;
    elsif v_actual > v_declared then
      v_expected_type := 'OVERTRICK';
    else
      v_expected_type := 'UNDERTRICK';
    end if;

    if v_event_type <> v_expected_type then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'event', jsonb_strip_nulls(jsonb_build_object(
        'id', p_event_id,
        'type', v_event_type,
        'createdAt', now(),
        'speakerBotId', v_speaker_bot_id,
        'targetSeat', v_target_seat,
        'declared', v_declared,
        'actualTricks', v_actual,
        'scoreDelta', v_score_delta,
        'round', nullif(v_deal->>'round', '')::integer,
        'deal', nullif(v_deal->>'dealNumber', '')::integer,
        'publicSummary', format('Θέση %s: δήλωση %s, μπάζες %s, μεταβολή %s.', v_target_seat + 1, v_declared, v_actual, v_score_delta),
        'replyDepth', 0
      ))
    );
  end if;

  if v_event_type in ('PLAYER_STOLE_CRITICAL_TRICK', 'BOT_STOLE_CRITICAL_TRICK') then
    if v_target_seat is null or v_salt <> v_target_seat + 60 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_trick := (v_state #> '{cards,completedTricks}') -> -1;
    if v_trick is null
       or nullif(v_trick->>'winnerSeat', '')::integer <> v_target_seat
       or nullif(v_trick #>> '{cards,0,seatIndex}', '')::integer = v_target_seat
       or exists (
         select 1
         from jsonb_array_elements(coalesce(v_trick->'cards', '[]'::jsonb)) play
         where play #>> '{card,kind}' = 'joker'
       ) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    v_owner_type := v_state #>> array['seats', v_target_seat::text, 'owner', 'type'];
    if v_owner_type not in ('human', 'bot') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_expected_type := case when v_owner_type = 'bot' then 'BOT_STOLE_CRITICAL_TRICK' else 'PLAYER_STOLE_CRITICAL_TRICK' end;
    if v_event_type <> v_expected_type then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'event', jsonb_strip_nulls(jsonb_build_object(
        'id', p_event_id,
        'type', v_event_type,
        'createdAt', now(),
        'speakerBotId', v_speaker_bot_id,
        'targetSeat', v_target_seat,
        'round', v_round,
        'deal', v_deal_number,
        'publicSummary', format('Θέση %s πήρε την μπάζα ενώ δεν άνοιξε τη μπάζα.', v_target_seat + 1),
        'replyDepth', 0
      ))
    );
  end if;

  if v_event_type = 'JOKER_PLAYED' then
    if v_salt <> 30 or v_target_seat is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_trick := (v_state #> '{cards,completedTricks}') -> -1;
    if v_trick is null
       or nullif(v_trick->>'winnerSeat', '')::integer <> v_target_seat
       or not exists (
         select 1
         from jsonb_array_elements(coalesce(v_trick->'cards', '[]'::jsonb)) play
         where play #>> '{card,kind}' = 'joker'
       ) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'event', jsonb_strip_nulls(jsonb_build_object(
        'id', p_event_id,
        'type', v_event_type,
        'createdAt', now(),
        'speakerBotId', v_speaker_bot_id,
        'targetSeat', v_target_seat,
        'round', v_round,
        'deal', v_deal_number,
        'replyDepth', 0
      ))
    );
  end if;

  if v_event_type = 'PREMIA_ACHIEVED' then
    if v_salt <> 40 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;
    v_premia := (v_state #> '{score,roundPremia}') -> -1;
    if v_premia is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    select (entry.ordinality - 1)::integer
    into v_expected_target
    from jsonb_array_elements_text(coalesce(v_premia->'adjustments', '[]'::jsonb)) with ordinality as entry(value, ordinality)
    where entry.value::integer > 0
    order by entry.ordinality
    limit 1;

    if v_target_seat is distinct from v_expected_target then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'event', jsonb_strip_nulls(jsonb_build_object(
        'id', p_event_id,
        'type', v_event_type,
        'createdAt', now(),
        'speakerBotId', v_speaker_bot_id,
        'targetSeat', v_target_seat,
        'round', nullif(v_premia->>'round', '')::integer,
        'replyDepth', 0
      ))
    );
  end if;

  if v_event_type = 'GAME_END' then
    if v_salt <> 50 or v_target_seat is not null or v_lifecycle <> 'complete' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
    end if;

    return jsonb_build_object(
      'ok', true,
      'event', jsonb_build_object(
        'id', p_event_id,
        'type', v_event_type,
        'createdAt', now(),
        'speakerBotId', v_speaker_bot_id,
        'publicSummary', format('Τελικό σκορ: %s.', v_state #>> '{score,cumulativeTotals}'),
        'replyDepth', 0
      )
    );
  end if;

  return jsonb_build_object('ok', false, 'code', 'INVALID_DIALOGUE_EVENT');
end;
$$;

revoke all on function public.resolve_dialogue_state_event_internal(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_dialogue_state_event_internal(text, uuid, text)
  to service_role;
