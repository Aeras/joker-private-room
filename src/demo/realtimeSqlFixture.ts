/** Isolated PGlite fixtures only. Supabase JWT/channel helpers and WAL transport are simulated. */
export const realtimeSqlFixture = String.raw`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth; create schema realtime;
create table public.players(id uuid primary key,is_active boolean not null);
create table public.games(id uuid primary key,state_version bigint not null,lifecycle text not null,canonical_state jsonb);
create table public.game_participants(game_id uuid,player_id uuid,owner_type text,status text);
create table private.player_sessions(id uuid primary key,player_id uuid,token_hash bytea,expires_at timestamptz,active_control boolean,revoked_at timestamptz);
create table realtime.messages(topic text,extension text,payload jsonb,private boolean);
alter table realtime.messages enable row level security;
grant usage on schema realtime,auth to authenticated;
grant select,insert,update,delete on realtime.messages to authenticated;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create function realtime.topic() returns text language sql stable as $$select nullif(current_setting('realtime.topic',true),'')$$;
create function realtime.send(payload jsonb,event text,topic text,is_private boolean) returns void language plpgsql as $$
begin
 if current_setting('test.broadcast_failure',true)='true' then raise exception 'simulated transport storage failure'; end if;
 insert into realtime.messages values(topic,'broadcast',payload,is_private);
end $$;
`;
