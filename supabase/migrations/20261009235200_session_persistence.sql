-- Match the secure cookie's 30-day lifetime with server-controlled session expiry.
-- Existing sessions keep their original 24-hour expiry; users reauthenticate once to
-- obtain a new 30-day session. Explicit logout and device takeover still revoke tokens.
-- No plaintext PIN or token is stored on the client.
create or replace function private.set_player_session_lifetime_internal()
returns trigger language plpgsql security definer
set search_path = pg_catalog, private
as $$
begin
  new.expires_at := new.issued_at + interval '30 days';
  return new;
end;
$$;

drop trigger if exists player_session_lifetime on private.player_sessions;
create trigger player_session_lifetime
before insert on private.player_sessions
for each row execute function private.set_player_session_lifetime_internal();
