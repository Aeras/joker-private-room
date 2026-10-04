begin;
do $$
#variable_conflict use_variable
declare result jsonb; room_id uuid; game_id uuid; code text; kind text; token text; action uuid; before_count integer; catalog jsonb; snapshot jsonb; caught boolean;
begin
 if has_function_privilege('anon','public.get_available_rulesets_internal(text)','execute') or has_function_privilege('authenticated','public.get_available_rulesets_internal(text)','execute') then raise exception 'Restricted options exposed'; end if;
 if (public.get_available_rulesets_internal(repeat('a',64))->'options')->3->>'id' <> 'panagiotis' then raise exception 'Stable authorized host missing option'; end if;
 if jsonb_array_length(public.get_available_rulesets_internal(repeat('b',64))->'options') <> 3 then raise exception 'Impersonating display name received restricted option'; end if;
 if public.get_available_rulesets_internal(repeat('d',64))->>'code' <> 'NOT_HOST' then raise exception 'Ordinary player received host options'; end if;
 if public.get_available_rulesets_internal('invalid')->>'code' <> 'NOT_AUTHENTICATED' then raise exception 'Unverified session received options'; end if;
 select count(*) into before_count from public.rooms;
 if public.create_room_internal(repeat('b',64),gen_random_uuid(),'panagiotis',false,false,false,'normal')->>'code' <> 'NOT_HOST' then raise exception 'Forged Panagiotis create authorized'; end if;
 if public.create_room_internal(repeat('b',64),gen_random_uuid(),'unknown',false,false,false,'normal')->>'code' <> 'RULESET_NOT_IMPLEMENTED' then raise exception 'Unknown ruleset accepted'; end if;
 if (select count(*) from public.rooms) <> before_count then raise exception 'Rejected create persisted a room'; end if;
 foreach kind in array array['popular','classic','minus'] loop
  foreach token in array array[repeat('a',64),repeat('b',64)] loop
   action := gen_random_uuid();
   result := public.create_room_internal(token,action,kind,false,false,false,'normal');
   if result->>'ok' <> 'true' or result#>>'{room,rulesetId}' <> kind then raise exception 'Selectable ruleset create failed: %',kind; end if;
   code := result#>>'{room,code}';
   if public.create_room_internal(token,action,kind,false,false,false,'normal')#>>'{room,code}' <> code then raise exception 'Create replay changed room'; end if;
   if not exists(select 1 from public.rooms where public.rooms.code = code and rules_version = kind || '-v1') then raise exception 'Rules version not persisted'; end if;
  end loop;
 end loop;
 result := public.create_room_internal(repeat('a',64),gen_random_uuid(),'panagiotis',false,false,false,'normal');
 if result#>>'{room,rulesetId}' <> 'panagiotis' or result#>>'{room,rulesetName}' <> 'Panagiotis Special 😈' then raise exception 'Authorized host presentation wrong'; end if;
 code := result#>>'{room,code}'; select id into room_id from public.rooms where public.rooms.code = code;
 result := public.join_room_internal(repeat('c',64),gen_random_uuid(),code);
 if result#>>'{room,rulesetId}' <> 'popular' or result::text like '%panagiotis%' then raise exception 'Target lobby identity leaked'; end if;
 result := public.join_room_internal(repeat('d',64),gen_random_uuid(),code);
 if result#>>'{room,rulesetId}' <> 'popular' or result::text like '%panagiotis%' then raise exception 'Other participant lobby identity leaked'; end if;
 catalog := '[{"id":"one","displayName":"One","avatarUrl":"/avatars/one.png","personalityId":"one","strategyProfileId":"strong-basic-v1","catalogVersion":"popular-bots-v1","rulesVersion":"popular-v1"},{"id":"two","displayName":"Two","avatarUrl":"/avatars/two.png","personalityId":"two","strategyProfileId":"memory-inference-v1","catalogVersion":"popular-bots-v1","rulesVersion":"popular-v1"},{"id":"three","displayName":"Three","avatarUrl":"/avatars/three.png","personalityId":"three","strategyProfileId":"probability-simulation-v1","catalogVersion":"popular-bots-v1","rulesVersion":"popular-v1"},{"id":"four","displayName":"Four","avatarUrl":"/avatars/four.png","personalityId":"four","strategyProfileId":"strong-basic-v1","catalogVersion":"popular-bots-v1","rulesVersion":"popular-v1"},{"id":"five","displayName":"Five","avatarUrl":"/avatars/five.png","personalityId":"five","strategyProfileId":"memory-inference-v1","catalogVersion":"popular-bots-v1","rulesVersion":"popular-v1"},{"id":"six","displayName":"Six","avatarUrl":"/avatars/six.png","personalityId":"six","strategyProfileId":"probability-simulation-v1","catalogVersion":"popular-bots-v1","rulesVersion":"popular-v1"}]'::jsonb;
 result := public.start_room_internal(repeat('a',64),gen_random_uuid(),code,(select room_version from public.rooms where id=room_id),catalog);
 if result->>'ok' <> 'true' then raise exception 'Start variant with shared bots failed: %', result; end if;
 game_id := (result->>'gameId')::uuid;
 if not exists(select 1 from public.games where id=game_id and ruleset_id='panagiotis' and rules_version='panagiotis-v1' and state_schema_version=4) then raise exception 'Start identity snapshot wrong'; end if;
 caught := false; begin update public.games set ruleset_id='popular',rules_version='popular-v1' where id=game_id; exception when others then caught := true; end;
 if not caught then raise exception 'Started identity changed'; end if;
 snapshot := '{"rulesetId":"panagiotis","rulesVersion":"panagiotis-v1","stateSchemaVersion":4,"progression":{"phase":"INITIAL_DEALER_SELECTION"},"cards":{"deck":[]},"privateRulesetState":{"targetPlayerId":"12302475-c4da-491c-9081-08c039384ac1"}}'::jsonb;
 update public.games set canonical_state=snapshot where id=game_id;
 caught := false; begin update public.games set canonical_state=jsonb_set(snapshot,'{privateRulesetState,targetPlayerId}','null'::jsonb) where id=game_id; exception when others then caught := true; end;
 if not caught then raise exception 'Frozen target changed'; end if;
 update public.game_participants set status='completed',final_score=100,final_placement=1 where public.game_participants.game_id = game_id;
 insert into public.game_history(game_id,room_id,ruleset_id,rules_version,state_schema_version,participants) values(game_id,room_id,'panagiotis','panagiotis-v1',4,'[{"seatIndex":0},{"seatIndex":1},{"seatIndex":2},{"seatIndex":3}]'::jsonb);
 result := public.get_game_history_internal(repeat('c',64),50);
 if result#>>'{history,0,rulesetId}' <> 'popular' or result#>>'{history,0,rulesVersion}' <> 'popular-v1' or result::text like '%panagiotis%' then raise exception 'Target history identity leaked'; end if;
 result := public.get_game_history_internal(repeat('d',64),50);
 if result::text like '%panagiotis%' then raise exception 'Other participant history identity leaked'; end if;
 if public.get_game_history_internal(repeat('b',64),50)->'history' <> '[]'::jsonb then raise exception 'Outsider history exposed'; end if;
 if public.get_game_history_internal(repeat('a',64),50)#>>'{history,0,rulesetId}' <> 'panagiotis' then raise exception 'Host history identity lost'; end if;
end $$;
rollback;