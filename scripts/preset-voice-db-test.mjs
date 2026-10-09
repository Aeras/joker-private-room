import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.env.BOT_LAB_PGLITE_ROOT;
if (!root) throw Error('Set BOT_LAB_PGLITE_ROOT to isolated PGlite dependency path');
const { PGlite } = await import(pathToFileURL(root + '/dist/index.js').href);
const { pgcrypto } = await import(pathToFileURL(root + '/dist/contrib/pgcrypto.js').href);
const db = new PGlite({ extensions: { pgcrypto } });
try {
  for (const path of ['supabase/tests/bot-lab/setup.sql','supabase/migrations/20261003173620_jk001_phase1_fix_session_validation_ambiguity.sql','supabase/tests/preset-voice/setup.sql','supabase/migrations/20261009110343_joker_preset_voice_independent_ai.sql']) await db.exec(await fs.readFile(path,'utf8'));
  await db.exec('create trigger voice_policy before insert on public.games for each row execute function private.snapshot_game_dialogue_policy_internal()');
  const call = async (token, ai, voice, text, action=crypto.randomUUID(), talk=true) => (await db.query('select public.create_room_internal($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9) r',[token,action,'popular',talk,false,ai,voice,text,'normal'])).rows[0].r;
  const id=crypto.randomUUID();
  const preset=await call('a'.repeat(64),false,true,false,id); assert.equal(preset.ok,true); assert.equal(preset.room.ttsEnabled,true); assert.equal(preset.room.aiEnabled,false); assert.equal(preset.room.showDialogueText,false);
  const game=(await db.query('insert into public.games(room_id) values($1::uuid) returning dialogue_policy',[preset.room.id])).rows[0].dialogue_policy;
  assert.equal(game.ttsEnabled,true);assert.equal(game.aiEnabled,false);assert.equal(game.showDialogueText,false);
  assert.equal((await call('a'.repeat(64),false,true,false,id)).replayed,true);
  assert.equal((await call('a'.repeat(64),false,true,true,id)).code,'ACTION_ID_CONFLICT');
  assert.equal((await call('b'.repeat(64),false,true,true)).code,'NOT_HOST');
  assert.equal((await call('c'.repeat(64),false,true,true)).code,'NOT_AUTHENTICATED');
  assert.equal((await call('invalid',false,true,true)).code,'NOT_AUTHENTICATED');
  assert.equal((await call('a'.repeat(64),false,false,false)).code,'INVALID_ROOM_STATE');
  assert.equal((await call('a'.repeat(64),false,true,true,crypto.randomUUID(),false)).code,'INVALID_ROOM_STATE');
  assert.equal((await call('a'.repeat(64),true,true,true)).ok,true);
  assert.equal((await call('b'.repeat(64),false,false,true)).ok,true);
  const permissions=(await db.query("select has_function_privilege('anon','public.create_room_internal(text,uuid,text,boolean,boolean,boolean,boolean,boolean,text)','execute') a,has_function_privilege('authenticated','public.create_room_internal(text,uuid,text,boolean,boolean,boolean,boolean,boolean,text)','execute') u,has_function_privilege('service_role','public.create_room_internal(text,uuid,text,boolean,boolean,boolean,boolean,boolean,text)','execute') s")).rows[0];assert.deepEqual(permissions,{a:false,u:false,s:true});
  await assert.rejects(db.query('update public.rooms set tts_enabled=true,bots_talk=false where id=$1::uuid',[preset.room.id]));
  console.log('PASS: preset voice, policy snapshot, exact-owner authorization, expired/invalid sessions, replay/CAS fingerprint, AI compatibility, constraints and RPC permissions');
} finally { await db.close(); }
