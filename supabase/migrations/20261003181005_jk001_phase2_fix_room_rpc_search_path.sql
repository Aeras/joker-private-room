alter function public.create_room_internal(text,uuid,text,boolean,boolean) set search_path = public, private, extensions, pg_temp;
alter function public.join_room_internal(text,uuid,text) set search_path = public, private, extensions, pg_temp;
alter function public.start_room_internal(text,uuid,text) set search_path = public, private, extensions, pg_temp;
