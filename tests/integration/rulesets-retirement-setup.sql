-- Disposable integration fixture: newer room projection columns.
alter table public.rooms add column tts_enabled boolean not null default false;
alter table public.rooms add column show_dialogue_text boolean not null default true;
