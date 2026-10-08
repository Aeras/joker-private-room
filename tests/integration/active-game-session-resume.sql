-- Run in a disposable DB after setup, auth foundation and device-resume migration.
-- Tests authentication/session decisions; game ownership uses the fixture lookup.
begin;
insert into public.players(id,display_name) values ('00000000-0000-4000-8000-000000007001','Resume fixture');
select public.set_player_pin('00000000-0000-4000-8000-000000007001','1234');
do $$
declare
 p uuid := '00000000-0000-4000-8000-000000007001';
 original record; resumed record; reused record; denied record; replaced record;
 session_count integer;
begin
 select * into original from public.authenticate_player_pin_internal(p,'1234','fixture-original',null);
 if original.result_code <> 'OK' or original.session_token is null then raise exception 'initial login failed'; end if;
 select * into denied from public.authenticate_player_pin_internal(p,'1234','fixture-other',null);
 if denied.result_code <> 'SECOND_ACTIVE_CONNECTION' then raise exception 'no-game second control must remain blocked'; end if;
 insert into private.test_active_game_ownership values (p,true);
 select * into denied from public.authenticate_player_pin_internal(p,'9999','fixture-other',null);
 if denied.result_code <> 'INVALID_CREDENTIALS' then raise exception 'incorrect PIN accepted'; end if;
 if not exists(select 1 from public.validate_player_session_internal(original.session_token)) then raise exception 'incorrect PIN revoked original'; end if;
 select * into resumed from public.authenticate_player_pin_internal(p,'1234','fixture-other',null);
 if resumed.result_code <> 'OK' or resumed.reuse_session or resumed.session_token is null or resumed.session_token=original.session_token then raise exception 'fresh verified resume failed'; end if;
 if exists(select 1 from public.validate_player_session_internal(original.session_token)) then raise exception 'old device can still control'; end if;
 if not exists(select 1 from public.validate_player_session_internal(resumed.session_token)) then raise exception 'new device invalid'; end if;
 if private.active_game_for_player_internal(p) is null then raise exception 'resume lost ownership'; end if;
 select count(*) into session_count from private.player_sessions where player_id=p and active_control and revoked_at is null;
 if session_count<>1 then raise exception 'multiple active controllers'; end if;
 select * into reused from public.authenticate_player_pin_internal(p,'1234','fixture-other',resumed.session_token);
 if reused.result_code <> 'OK' or not reused.reuse_session or reused.session_token is not null then raise exception 'same-device retry rotated session'; end if;
 select * into replaced from public.authenticate_player_pin_internal(p,'1234','fixture-third',null);
 if replaced.result_code <> 'OK' then raise exception 'repeat handoff failed'; end if;
 if exists(select 1 from public.validate_player_session_internal(resumed.session_token)) then raise exception 'previous resume still valid'; end if;
 for i in 1..5 loop
  perform public.authenticate_player_pin_internal(p,'9999','fixture-third',null);
 end loop;
 select * into denied from public.authenticate_player_pin_internal(p,'1234','fixture-third',null);
 if denied.result_code<>'PIN_COOLDOWN_ACTIVE' then raise exception 'resume bypasses PIN cooldown'; end if;
 if not exists(select 1 from public.validate_player_session_internal(replaced.session_token)) then raise exception 'cooldown revoked controller'; end if;
 if has_function_privilege('anon','public.authenticate_player_pin_internal(uuid,text,text,text)','execute') or has_function_privilege('authenticated','public.authenticate_player_pin_internal(uuid,text,text,text)','execute') then raise exception 'public auth RPC exposure'; end if;
 if not has_function_privilege('service_role','public.authenticate_player_pin_internal(uuid,text,text,text)','execute') then raise exception 'service wrapper denied'; end if;
end $$;
rollback;
