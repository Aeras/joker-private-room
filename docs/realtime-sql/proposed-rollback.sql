-- REVIEW CANDIDATE; run only after explicit infrastructure approval.
-- First turn OFF browser/app/Edge flags. Then disable emissions before removing objects.
begin;
update private.joker_realtime_config set enabled=false where singleton;
drop trigger if exists joker_state_invalidation on public.games;
drop policy if exists joker_receive on realtime.messages;
drop policy if exists joker_receive_guard on realtime.messages;
drop policy if exists joker_no_send on realtime.messages;
drop policy if exists joker_no_update on realtime.messages;
drop policy if exists joker_no_delete on realtime.messages;
drop function if exists private.emit_joker_invalidation();
drop function if exists public.joker_realtime_receive_authorized(text);
drop function if exists public.authorize_joker_realtime_internal(text,uuid);
drop table if exists private.joker_realtime_config;
commit;
-- Existing cached sockets may retain permission until JWT expiry. Emission is disabled;
-- per-session topics stop updates. Do not rotate unrelated Auth/project keys to roll back.
