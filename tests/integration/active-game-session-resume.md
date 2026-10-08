# Active-game device resume verification

Use a disposable PostgreSQL database only. The setup creates synthetic players and a fixture active-game lookup; it must never run on the production database.

Run with psql, ON_ERROR_STOP=1, in this order:

1. active-game-session-resume-setup.sql
2. ../../supabase/migrations/20261003172944_jk001_phase1_auth_foundation.sql
3. ../../supabase/migrations/20261003173620_jk001_phase1_fix_session_validation_ambiguity.sql
4. ../../supabase/migrations/20261008123355_jk007_active_game_device_resume.sql
5. active-game-session-resume.sql

Verified locally with PGlite PostgreSQL and its real pgcrypto extension. Tests cover valid initial login, same-session reuse, wrong PIN, preservation of no-game second-session rejection, active-game token rotation, invalidation of old tokens, exactly one active controller, ownership retention, repeated device handoff, PIN cooldown, and service-role-only RPC grants. The credentials row lock serializes authentication; the partial unique session index remains intact. Parallel independent PostgreSQL connection races were not exercised by the single-connection PGlite fixture.

Frontend behavioral tests: src/test/join-game-resume.test.tsx. Chromium fixtures verified code-free owned-table routing, missing-code prompt only when no active game exists, and fitting controls at 900x420 and 1920x1080.

Production target was checked read-only: Joker connection, wubrgnzbvtrzbvvqalfw, matching src/integrations/external-supabase/client.ts. No production migration or Edge Function deployment was performed during preparation. Applying the new migration is necessary for switching devices when the old session remains alive. Publishing the frontend alone does not enable that case.
