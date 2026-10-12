# Secure Realtime PR #248 — preactivation findings (read-only)

Verified: sandbox HEAD = b871cdbf55acf7d3267926a7655caab246e1d21d. No changes made.

## Findings
1. App server env `JOKER_REALTIME_ENABLED`: NOT present (unset in runtime; not among the 5 Lovable project secrets). Broker server fn therefore returns DISABLED.
2. Build env `VITE_JOKER_REALTIME_ENABLED`: NOT present (unset, not in `.env`). `table.tsx` gate is off; no browser socket opens.
3. Edge `game-state` gate also needs its own Edge `JOKER_REALTIME_ENABLED=true` plus the three signing secrets. Those live in the owner's external backend; Lovable cannot see or verify them. Presence of names proves nothing about JWK/kid/issuer correctness.
4. Lovable can set the server secret (Project Settings → Secrets, or via secrets tool on approval). A `VITE_` value is baked into the client bundle at build time; it is non-secret and would be set as a code/`.env` change plus rebuild/publish.
5. End-to-end ES256 test: not safely possible from here without enabling something. The broker refuses to sign unless Edge flag is true; validating a token requires a real session cookie and the real Supabase Realtime; and the external project's JWKS trust of an imported standby key cannot be confirmed from Lovable. A server-only test that never prints tokens is feasible only after the Edge flag is on in a staging (non-production) project.

## Blockers
- No confirmed staging project (report prerequisite 1).
- Standby key: Supabase only trusts standby keys for verification once listed in JWKS; whether Realtime accepts a standby (non-current) imported key is unverified — must be tested.
- Issuer: Supabase Realtime validates signature against project keys; custom `iss=joker-realtime-v1` acceptance is unverified.
- Four gates all off (browser, app server, Edge, DB config).

## Minimal safe activation steps (each needs explicit approval)
1. Owner, in staging: confirm JWKS lists the standby `kid`; run policy/grant audit.
2. Owner, staging Edge: set `JOKER_REALTIME_ENABLED=true`; DB config enabled with issuer `joker-realtime-v1`.
3. Lovable: add server secret `JOKER_REALTIME_ENABLED=true` (app server only). Then run a server-only check calling `getRealtimeCapability` with a test session, logging only `ok`/`code`, header `alg`/`kid` match (boolean), and Realtime `SUBSCRIBED` (boolean) — no token, cookie or key output.
4. If pass: set `VITE_JOKER_REALTIME_ENABLED=true`, rebuild, two-client test with polling retained.
5. Rollback: flags off in reverse order; polling stays.

Nothing above will be executed without your approval; PIN/cookie auth and polling untouched.
