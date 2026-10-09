-- Disposable database fixture. Session validation is the real production function.
create table public.rooms(id uuid primary key default gen_random_uuid(),code text,host_player_id uuid,ruleset_id text,rules_version text,bots_talk boolean,allow_profanity boolean,ai_enabled boolean,tts_enabled boolean,show_dialogue_text boolean,dialogue_intensity text);
create table public.games(id uuid primary key default gen_random_uuid(),room_id uuid,dialogue_policy jsonb);
create table public.room_seats(room_id uuid,seat_index int,occupant_type text,player_id uuid,connected boolean);
create table private.room_command_ledger(player_id uuid,action_id uuid,command_type text,request_fingerprint text,result jsonb);
create function private.active_game_for_player_internal(uuid) returns jsonb language sql as $$select null::jsonb$$;
create function private.generate_room_code_internal() returns text language sql as $$select left(md5(random()::text),8)$$;
create function private.room_projection_internal(uuid,uuid) returns jsonb language sql as $$select jsonb_build_object('id',id,'botsTalk',bots_talk,'aiEnabled',ai_enabled,'ttsEnabled',tts_enabled,'showDialogueText',show_dialogue_text) from public.rooms where id=$1 and host_player_id=$2$$;
