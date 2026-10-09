import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const root = process.env.BOT_LAB_PGLITE_ROOT;
if (!root) throw Error('Set BOT_LAB_PGLITE_ROOT to isolated PGlite dependency path');
const { PGlite } = await import(pathToFileURL(root + '/dist/index.js').href);
const { pgcrypto } = await import(pathToFileURL(root + '/dist/contrib/pgcrypto.js').href);
const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(await fs.readFile('tests/integration/rulesets-setup.sql', 'utf8'));
  for (const name of ['20261003180716_jk001_phase2_room_authority', '20261003181005_jk001_phase2_fix_room_rpc_search_path', '20261003191742_jk001_phase4_game_state_cas', '20261003194500_jk001_phase5_projection_viewer_seat', '20261003211612_jk001_phase7_bot_roster_authority', '20261004053000_jk001_phase12_atomic_finalization_history', '20261004095255_jk001_ai_banter_phase_a_policy_authority', '20261004200838_jk003_versioned_ruleset_policies']) {
    await db.exec(await fs.readFile(`supabase/migrations/${name}.sql`, 'utf8'));
  }
  await db.exec(await fs.readFile('tests/integration/rulesets-retirement-setup.sql', 'utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261009051533_joker_admin_bot_lab.sql', 'utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261009224444_remove_panagiotis_variant.sql', 'utf8'));
  await db.exec(await fs.readFile('tests/integration/rulesets.sql', 'utf8'));
  console.log('PASS: three rulesets, retired create rejection, permissions, CAS identity, Classic deck and canonical start');
} catch (cause) { console.error(cause.message); process.exitCode = 1; } finally { await db.close(); }
