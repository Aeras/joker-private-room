# Secure JOKER Realtime implementation

Base: latest main b41fe8c8c9d8de17375a8f58451259f0b7899392, including #244–246. Independent from Phase C PR #247. No production calls with player data, database mutation, signing-key configuration, deployment, Lovable usage or merge.

## PASS / FAIL / BLOCKED

PASS: safe broker core, ES256 signing with an ephemeral test key, same-origin session boundary, isolated receive-only client, lifecycle/coalescing/recovery code, strictly sanitized protocol, unchanged polling and authorized snapshot admission. Final checks: 162 test files / 1,071 tests passed (including 15 new Realtime tests); TypeScript and production build passed. New modules pass normal ESLint. Changed-source semantic lint has zero errors and four existing hooks warnings. Chromium simulated notification integration passed in Popular/Classic/Minus, three consecutive tricks each. Built public JavaScript contains neither the session-cookie name nor the signing/service-role configuration names.

PASS (isolated PostgreSQL): reviewed SQL candidate executes in PGlite 0.5.8 with real PostgreSQL transactions and RLS. Thirteen grouped checks cover disabled default, session-derived authorization, sanitized updates, rollback, replay, denied raw tables/RPC/client sends, topic/session/expiry/issuer/direct-history restrictions, permissive-policy interactions, revocation, takeover topics, notification-storage failure, terminal ordering and rollback script.

FAIL: repository-wide formatting lint remains a pre-existing issue (Realtime repository source lint found 34,912 errors / 24 warnings, mostly CRLF/formatting); it is not a clean lint gate. Scoped semantic lint results are reported separately. Unrelated formatting was not rewritten.

BLOCKED/unverified: actual authenticated Supabase private-channel delivery, imported-key trust, Realtime daily partitions/WAL transport, production policy/grant configuration, paired live clients, Edge Deno deployment runtime and physical devices. PGlite uses simulated auth.jwt/auth.uid/realtime.topic helpers and a transactional Broadcast sink; it proves SQL/RLS/rollback behavior, not Supabase JWT validation or network delivery. No staging environment was confirmed, so no external integration tests were run.

## Authentication and privacy

PIN auth remains a 30-day opaque HttpOnly cookie backed by private.player_sessions. It is not a Supabase Auth session. The new POST server function reads that cookie only on the server, rejects absent/malformed sessions, and calls a narrowly scoped action of the existing game-state gateway. Browser callers submit only gameId; they never choose subject/session/role/topic/signing claims.

The Edge gateway uses its existing service-role connection to call a new service-only authorization RPC proposed in SQL. It validates the custom session, player activation and current human game participation, deriving player/session identity without returning any canonical game data. The portable broker creates a 90-second maximum ES256 capability, capped by custom-session expiry, with role/audience authenticated and top-level receive-only game/session/topic claims. Signing uses an explicitly configured imported P-256 private JWK/kid/issuer. It never derives keys from publishable/service-role keys. Only ephemeral test keys were generated locally.

The browser stores the capability only in its dedicated, non-persistent client/socket. The dedicated client supplies an explicit accessToken callback to prevent the SDK Auth bootstrap from replacing the capability; cleanup clears that callback token. No Auth setSession, refresh token, localStorage persistence or mutation of the shared external-Supabase client. Only a private Broadcast handler is registered: no postgres_changes, Presence, send or canonical-table subscription. The service-role/signing key never enters browser code or diagnostics.

Existing source migrations revoke anon/authenticated access to games, game_participants, room_seats, rooms, credentials and sessions; privileged game/room/session RPCs are service-only. This is source evidence, not a production grant audit. Newly issued authenticated tokens require a staging audit of ALL current grants/policies/functions, including unrelated public APIs.

## Notification and authoritative flow

Exact payload: protocol=1, gameId, stateVersion, kind=state_changed/game_closed, emittedAt. Unknown fields are rejected. No hands, deck, cards, entropy, seeds, private projections, PINs, cookies, hashes or recipient identities in messages. A notification only wakes refreshAll(true). Existing coherent room/projection pairing, SnapshotAdmission, TableReturnSync and public presentation journal remain authoritative and ordered.

One client refresh plus a bounded follow-up coalesces notifications. Only returned admitted projection versions advance its local admission hint, never notification versions. A bounded 64-version seen set suppresses duplicates/out-of-order delivery. An implausibly future notification is forgotten as a refresh target after two reads, so it cannot create an indefinite retry loop or permanently suppress real versions. Existing 200/500/1500ms polling is unchanged, including bot reconciliation/deadlines/deal barriers.

SUBSCRIBED triggers a fresh authorized read to close the load-to-subscribe gap. Renewal closes the old socket and revalidates the HttpOnly session before issuing a new token. Expiry/failure closes or retries with bounded 2–30s backoff; commands do not wait for it. Route cleanup/hidden tab/completed game invalidates callbacks and resources. Foreground creates a fresh capability while existing return hydration performs authoritative recovery. Broker revocation/membership rejection stops the subscription. Room-only changes remain covered by ordinary room refresh; there is no invented room-version stream.

## Revocation and SQL proposal

Supabase caches private-channel permission until token refresh/expiry. A short JWT alone does not immediately revoke an already-open socket. The proposed emitter therefore resolves valid current sessions at each mutation and fans out to one game/session topic per participant. Revoked/taken-over sessions receive no future mutation messages; newly authenticated sessions have a different topic. Already queued sanitized messages/terminal wake-ups may still arrive.

SQL lives under docs/realtime-sql, outside auto-applied migrations. No database changes were applied. It creates a private disabled config row, service-only identity RPC, narrowly scoped boolean SECURITY DEFINER receive helper with empty search_path and signed subject/issuer/audience/game/session/expiry checks, SELECT Broadcast policy and restrictive SELECT/INSERT/UPDATE/DELETE guards. It checks row.topic AND realtime.topic, excluding direct history access. No custom objects in realtime, no ALTER TABLE realtime.messages, no raw-games publication, no new canonical grants.

The candidate refuses to apply if existing Realtime policies or authenticated canonical-game grants require review. Restrictions protect capability claims even if broad policies are subsequently added. The boolean helper intentionally returns no row data and validates auth.uid; it is public solely to avoid granting authenticated usage on the private schema. All default PUBLIC function permissions are revoked appropriately.

A private AFTER INSERT/UPDATE-of-version/lifecycle trigger uses realtime.send with a hand-built sanitized object. Human CAS, worker/bot CAS and finalization all update public.games through that boundary. Same-version replay produces no event; rejected CAS produces no row update. Game and notification insertion share the PostgreSQL transaction, so rollback removes both. Notification failure is caught per recipient and must not reject a legal game move; polling recovers.

Actual source ordering: atomic finalization updates games before participant status; host termination updates games before revoking participant sessions. This allows one final sanitized wake-up before cleanup in the same transaction. Trigger tests exercise that ordering on isolated PostgreSQL. Complete Supabase RPC/worker integration and daily-partition/no-listener failure behavior remain staging tests.

## Activation prerequisites (explicit approval required)

1. Confirm a separate non-production Supabase project and apply the owner's current schema there. Inventory pg_policies, grants/RPC execution, exposed schemas and publication contents. Verify no capability can read canonical rows/private functions; run advisors/read-back checks.
2. Review the SQL candidate and generate a properly named migration via supabase migration new after staging verification. The CLI/psql/Deno are unavailable locally; no fabricated auto-applied migration was created. The isolated PGlite runner requires no network/database URL.
3. Owner configures a project-trusted imported asymmetric signing key deliberately, without exporting/replacing unrelated managed production keys. Configure Edge JOKER_REALTIME_SIGNING_JWK, JOKER_REALTIME_SIGNING_KID and JOKER_REALTIME_JWT_ISSUER. SQL config jwt_issuer must exactly match the approved issuer. Never log these secrets.
4. Review private-only Realtime access settings and existing policies. Test positive private reception, forged/wrong issuer/audience/subject/topic/expired tokens, cross-player subscriptions, client sends/Presence, Data API history/raw-state denial, current-session revocation and cached sockets.
5. Apply/deploy only with explicit approval. Four independent gates stay OFF here: browser VITE_JOKER_REALTIME_ENABLED, app-server JOKER_REALTIME_ENABLED, Edge JOKER_REALTIME_ENABLED plus complete trusted signing config, and private.joker_realtime_config.enabled (with approved issuer).
6. In confirmed staging, verify transaction rollback/rejected CAS/replay, human/worker/bot writes, terminal host end, no listeners/daily partitions, reconnect, dropped notifications, concurrent commands and foreground return using two authenticated real clients. Retain polling throughout. Only then request production activation approval.

## Rollback

Turn OFF browser/app/Edge flags, disable the private emission config, then use proposed-rollback.sql only with infrastructure approval. It removes this feature's trigger/policies/functions/config and leaves canonical game state, auth sessions, publications and unrelated keys untouched. Closing/reloading clients and short JWT expiry release cached subscriptions; disabled emissions stop future updates. Existing polling remains functional. Do not rotate unrelated Auth keys as a rollback shortcut.

## Instrumentation and measurements

Existing request/response diagnostics remain. Added local_play_input, admitted projection version and remote_canvas_first_surface markers allow same-device input-to-launch and projection-to-sprite attribution alongside existing journal/card IDs. Notification receipt-to-authorized refresh is measured locally; status/failure counters contain no credentials/topics. Optional enabled-only PerformanceObserver long-task samples and backing-byte/Chromium-heap samples are bounded by the existing diagnostic ring and cleaned up on unmount/background. Backing bytes are an estimate, not total GPU/image/native memory.

The trigger emittedAt is before commit, not a commit timestamp. Cross-device clocks are not synchronized. Commit-to-receive and end-to-end remote visibility require paired-client orchestration plus clock-offset uncertainty/server tracing; these are prepared, not claimed measured. Broker expiry conservatively rejects implausible lifetime/clock skew and falls back to polling.

Browser integration harness uses simulated capability/Broadcast transport with actual RealtimeLifecycle, authorized projection, canonical commands/bots, GameTable/journal/Canvas. Three rulesets each complete three consecutive tricks and suppress duplicate/older notifications. This demonstrates renderer integration, not actual authenticated Supabase delivery or production latency improvement.

## Changed files and responsibilities

- src/services/realtime/{protocol,lifecycle,socket,metrics}.ts: allowlist, version coalescing, socket ownership and coarse diagnostics.
- src/services/realtimeFunctions.ts: same-origin cookie broker boundary, no-store response, explicit server gate/timeout.
- supabase/functions/_shared/joker-realtime-capability.ts and game-state/index.ts: portable signing core and gated service-role RPC action.
- src/routes/table.tsx: gated wakeup integration/cleanup through existing refresh path.
- GameTable.tsx and canvas/CanvasTrickScene.tsx: instrumentation only, no rendering migration or rules change.
- docs/realtime-sql/{proposed-setup,proposed-rollback}.sql: disabled review candidate, never applied.
- src/test/joker-realtime{,-boundary}.test.ts: broker/privacy/lifecycle/crypto/client boundary tests.
- src/demo/realtimeSqlFixture.ts, scripts/verify-joker-realtime-sql.cjs: isolated PostgreSQL fixtures and assertions.
- src/demo/canvasBrowserFixtureSource.ts, scripts/verify-joker-realtime-browser.cjs: simulated notification-to-real-Canvas integration.
- docs/joker-realtime-architecture.md: original investigation linked to current implementation status.

## Official sources rechecked

[Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [JWT support](https://supabase.com/docs/guides/auth/jwts), [Signing keys](https://supabase.com/docs/guides/auth/signing-keys), [changelog](https://supabase.com/changelog). The lightweight changelog.md was attempted but the web tool rejects that content type; rendered changelog confirmed the July schema-lockdown change. Private JWT/RLS caching, receive-only authorization, transactional send, imported keys and partition limits were reconciled with current documentation. No assumption of a publishable key proving membership.
