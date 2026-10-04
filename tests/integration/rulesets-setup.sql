-- Disposable PostgreSQL integration fixture. Custom sessions are stubbed; PINs are never used.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema private;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.players(id uuid primary key, display_name text not null, is_host boolean not null, is_active boolean not null default true);
insert into public.players(id,display_name,is_host) values
 ('a1f36a77-1732-44d4-8c3b-4623a6e6ed0c','Renamed authorized host',true),
 ('00000000-0000-4000-8000-000000003002','Giobis',true),
 ('12302475-c4da-491c-9081-08c039384ac1','Renamed target',false),
 ('00000000-0000-4000-8000-000000003004','Ordinary participant',false);
create function public.validate_player_session_internal(token text) returns table(id uuid, display_name text, is_host boolean) language sql as $$
 select p.id,p.display_name,p.is_host from public.players p where p.id = case token
 when repeat('a',64) then 'a1f36a77-1732-44d4-8c3b-4623a6e6ed0c'::uuid
 when repeat('b',64) then '00000000-0000-4000-8000-000000003002'::uuid
 when repeat('c',64) then '12302475-c4da-491c-9081-08c039384ac1'::uuid
 when repeat('d',64) then '00000000-0000-4000-8000-000000003004'::uuid end;
$$;