insert into public.games values('00000000-0000-4000-8000-000000000310','active',7);
insert into public.game_participants values
('00000000-0000-4000-8000-000000000310',0,'00000000-0000-4000-8000-000000000301','human','active'),
('00000000-0000-4000-8000-000000000310',1,'00000000-0000-4000-8000-000000000303','human','active'),
('00000000-0000-4000-8000-000000000310',2,null,'bot','active');
do $test$
declare r jsonb; game uuid:='00000000-0000-4000-8000-000000000310'; mid uuid:='00000000-0000-4000-8000-000000000320';
begin
  r:=public.ephemeral_table_messages_internal(repeat('c',64),game,'list');
  if r->>'code'<>'NOT_AUTHENTICATED' then raise exception 'invalid session accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('b',64),game,'list');
  if r->>'code'<>'NOT_AUTHORIZED' then raise exception 'outsider accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,0,'hello');
  if r->>'code'<>'INVALID_TARGET' then raise exception 'self accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,3,'hello');
  if r->>'code'<>'INVALID_TARGET' then raise exception 'empty seat accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,9,'hello');
  if r->>'code'<>'INVALID_TARGET' then raise exception 'unknown seat accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,null,'   ');
  if r->>'code'<>'INVALID_MESSAGE' then raise exception 'empty text accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,null,repeat('x',81));
  if r->>'code'<>'INVALID_MESSAGE' then raise exception 'unbounded text accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,null,'everyone');
  if r->>'ok'<>'true' or r#>>'{messages,0,fromSeat}'<>'0' or r#>>'{messages,0,to}'<>'all' then raise exception 'sender/everyone failed: %',r; end if;
  if exists(select 1 from private.ephemeral_game_messages where expires_at-created_at<>interval '5 seconds') then raise exception 'TTL not exact'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,null,'everyone');
  if jsonb_array_length(r->'messages')<>1 then raise exception 'duplicate delivery'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,2,'different');
  if r->>'code'<>'MESSAGE_ID_CONFLICT' then raise exception 'message identity collision accepted'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send','00000000-0000-4000-8000-000000000321',2,'bot');
  if r->>'ok'<>'true' then raise exception 'permanent bot rejected'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send','00000000-0000-4000-8000-000000000322',1,'human');
  if r->>'ok'<>'true' then raise exception 'occupied human rejected'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send','00000000-0000-4000-8000-000000000323',null,'fourth');
  if r->>'code'<>'RATE_LIMITED' then raise exception 'rate limit failed'; end if;
  if (select state_version from public.games where id=game)<>7 then raise exception 'message changed game version'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'list');
  if jsonb_array_length(r->'messages')<>3 then raise exception 'reconnect before expiry failed'; end if;
  update private.ephemeral_game_messages set created_at=statement_timestamp()-interval '6 seconds',expires_at=statement_timestamp()-interval '1 second';
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'list');
  if jsonb_array_length(r->'messages')<>0 then raise exception 'expired returned on reconnect'; end if;
  if exists(select 1 from private.ephemeral_game_messages) then raise exception 'expired text retained'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'send',mid,null,'before completion');
  update public.games set lifecycle='complete' where id=game;
  if exists(select 1 from private.ephemeral_game_messages) then raise exception 'completion retained message text'; end if;
  r:=public.ephemeral_table_messages_internal(repeat('a',64),game,'list');
  if r->>'code'<>'NOT_AUTHORIZED' then raise exception 'completed-game transcript accessible'; end if;
  if has_function_privilege('anon','public.ephemeral_table_messages_internal(text,uuid,text,uuid,integer,text)','execute') or has_function_privilege('authenticated','public.ephemeral_table_messages_internal(text,uuid,text,uuid,integer,text)','execute') then raise exception 'public message RPC access'; end if;
end;
$test$;
select 'JK-002 message DB integration: PASS' as result;
