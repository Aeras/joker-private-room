# JOKER secure Realtime investigation

Status: architecture investigation only. No production reads of player data, database writes, policies, publications, keys, deployments or migrations were performed. This document is not an implemented Realtime service.

Source inspected: the working tree based on GitHub main `22ca49634317f963c61a4d85f65d4efa4779b920`, including merged PR #244. Only the owner's external project `wubrgnzbvtrzbvvqalfw` is applicable. DURAK, Bot Lab records and Lovable's generated integration are outside this proposal.

## Actual boundaries and constraints

| Source | Actual responsibility |
| --- | --- |
| `src/services/authFunctions.ts` | PIN authentication sets `__Host-joker_session`: Secure, HttpOnly, SameSite=Lax, 30-day cookie. JavaScript receives public player identity, not the session token. |
| `supabase/migrations/20261003172944_jk001_phase1_auth_foundation.sql` | Stores hashed opaque sessions in `private.player_sessions`, with player ID, expiry, revocation and active-control status. This is custom authentication, not `auth.users`. |
| `supabase/migrations/20261003173620_jk001_phase1_fix_session_validation_ambiguity.sql` | Session validation hashes the token, checks active control/revocation/expiry and updates last-seen. Only service role can execute it. |
| `supabase/migrations/20261009235200_session_persistence.sql` | New custom sessions last 30 days. This lifetime must not become the Realtime JWT lifetime. |
| `src/integrations/external-supabase/client.ts` | Creates a browser Supabase client with the external publishable key. A publishable key is not a participant JWT. No PIN-to-Supabase-Auth bridge is implemented. |
| `src/server/gamePersistence.ts` | Server obtains the HttpOnly cookie and calls the external game-state Edge endpoint. Canonical state remains on the server. |
| `supabase/functions/game-state/index.ts` | Service-role gateway validates opaque session shape and invokes internal RPCs. It is not the browser's authorized projection endpoint. |
| `supabase/migrations/20261003180716_jk001_phase2_room_authority.sql` | `games`, `game_participants`, `rooms`, `room_seats` have RLS and no direct anon/authenticated table grants. Participants connect identity to seats. Later migrations extend rulesets/lifecycle. |
| `supabase/migrations/20261003191742_jk001_phase4_game_state_cas.sql` | CAS persistence increments `games.state_version`, locks the game, verifies membership and writes idempotency ledger in the transaction. `canonical_state` contains hidden information. |
| `supabase/migrations/20261004053000_jk001_phase12_atomic_finalization_history.sql` | Finalization has its own atomic update path. A notification implementation must include it. |
| `supabase/migrations/20261004232919_jk006_release_sessions_on_host_end.sql` | Host termination also updates canonical game state and releases session/control state. Terminal notifications must not assume active membership survives finalization. |
| `supabase/migrations/20261004164513_jk002_reconciler_worker_boundary.sql` | Worker persistence/finalization writes canonical state independently of human command requests. App-level notifications only inside human commands would miss bot/system changes. |
| `src/domain/projection.ts` | `projectGameForSeat` exposes own visible hand, public plays/history and own legal actions. It excludes other hands and server entropy/deck order. |
| `src/services/gameProjectionFunctions.ts` | Authorized server functions reconcile or submit commands and then return only a seat projection. Human command acknowledgement deliberately does not execute the next bot inside the POST. |
| `src/routes/table.tsx` | Single-flight projection refresh, one queued follow-up, coherent room/projection pairing, foreground generation invalidation and monotonic admission already exist. No gameplay Realtime subscription. |
| `src/components/table/tablePolling.ts` | Bot polls 200 ms; remote-human CARD_PLAY polls 500 ms; idle/deal/legacy presentation boundaries poll 1500 ms. |
| `src/components/table/snapshotAdmission.ts` | Rejects lower authoritative versions and late same-version responses. Notification versions must not bypass it. |
| `src/domain/turnPresentation.ts`, `src/server/reconciliationCore.ts` | The old 30-second per-play acknowledgement helper remains, but current reconciliation releases legacy boundaries immediately. It is not a new global dependency: do not reintroduce it. |
| `src/server/nineCardPresentation.ts`, `src/services/gameProjectionFunctions.ts` | Deal/start acknowledgements remain genuine authoritative barriers. Realtime accelerates observation; it must not decide their release locally. |

## Authentication prerequisite

Private Broadcast cannot be securely activated by calling `getBackend().channel(..., {config:{private:true}})` alone. Browser requests currently have a publishable key and an application cookie for the app origin, not a Supabase participant JWT.

The smallest identity bridge is a short-lived, receive-only Realtime capability broker:

1. A same-origin POST server function receives only the game ID. It obtains the existing HttpOnly cookie server-side; the browser never supplies player ID as authority.
2. A service-only backend operation validates the custom session, player activation and actual human game membership, and returns the session ID and allowed topic. It must not return the opaque session token or its hash. Existing session validation returns player ID but not session ID, so a narrowly scoped operation is needed.
3. A server-held, project-trusted imported asymmetric signing key signs a JWT with `sub` = existing player UUID, `role` = authenticated, explicit issuer/audience, very short expiry (proposed 60–120 seconds), `jkr_session_id`, `jkr_game_id`, and receive-only scope. Expiry is capped by the underlying custom-session expiry. Role/scope/game/session claims are server-selected.
4. The client keeps this capability in memory, sets Realtime authentication, and refreshes before expiry by revalidating the original session. It does not call Supabase Auth `setSession`, persist a refresh token or replace PIN authentication.
5. A separate browser client/socket isolates the capability from unrelated external-Supabase operations and prevents one room's authentication refresh changing another channel's identity accidentally. Route cleanup removes the channel and clears the capability.

The project must explicitly trust an imported key. Possession of a service-role API key does not mean the app possesses a JWT signing secret. No secret should be inferred, downloaded, printed or committed. Do not use the opaque publishable key as a Bearer token or expose service-role credentials.

An alternative is server-managed mapping to genuine Supabase Auth users/sessions after PIN validation. It requires user provisioning, credential/session ownership, takeover/logout integration and substantially more review. Anonymous Auth sign-in without a securely validated mapping is insufficient: `authenticated` alone does not prove game membership. A custom access-token hook is also not a substitute for initial Auth-session provisioning.

Any capability using role `authenticated` must be tested against *all existing grants and policies*, not just Realtime. A dedicated restricted database role could reduce scope but needs supported configuration review; do not invent or enable it without staging validation.

## Notification contract

Use server-only private Broadcast invalidation, not `postgres_changes` on canonical tables and not `realtime.broadcast_changes(NEW, OLD)`.

Example allowlisted payload:

```json
{
  "protocol": 1,
  "gameId": "uuid",
  "stateVersion": 123,
  "kind": "state_changed",
  "emittedAt": "server timestamp"
}
```

Event name: `joker_state_changed`. The payload must be built field by field. No canonical JSON, hand, card, deck, shuffle seed, semantic action, PIN, opaque token, token hash, session ID, participant roster or private projection belongs in it. The topic identifies the subscription audience; do not copy it into telemetry.

The notification requests a refresh. It is never a move, an acknowledgement, a score update, a projection, or proof of legality. Even a well-formed signed-channel event cannot replace the server response.

Use `gameId + stateVersion` as a deduplication identity. Do not advance SnapshotAdmission's accepted version from notifications. Only admitted projections advance that version. Coalesce to the highest pending version while a request is running; queue a refresh if the received projection has not reached it. A forged far-future value must not cause an unbounded retry loop: cap retries/backoff, retain polling and only trust server snapshots.

## Topic authorization and revocation

Supabase currently caches private-channel permissions during a connection. Deleting membership does not instantly recheck every outgoing message. A shared room topic and a membership policy alone therefore leave a revocation window until expiry or token renewal.

For strict current-participant delivery, prefer bounded recipient fanout: one private topic per game and current custom session, for example `joker:v1:<gameUUID>:<sessionUUID>`. It remains logically room-scoped, but each recipient gets an individually authorized channel. Four-seat private games make this small fanout affordable in principle; benchmark it before enabling.

The RLS receive predicate must bind the exact topic to the JWT game/session/subject and confirm current valid session and permitted participant membership. A narrowly scoped boolean lookup in a non-exposed schema may be necessary because participants/sessions are intentionally inaccessible to authenticated clients. If SECURITY DEFINER is required for that lookup, fix its search path, verify `auth.uid()` and signed claims, deny default PUBLIC execution, grant only the needed function/schema usage, and return no row data. Do not call the existing mutating last-seen validator from an RLS SELECT predicate.

Only a SELECT policy for `extension = 'broadcast'` is needed. Do not grant client INSERT/send or Presence permission. Check for existing permissive `realtime.messages` policies: policies combine, so an older broad receive/send policy can defeat the new restriction. Policies must restrict direct message history reads too (topic column where applicable), not only channel join via `realtime.topic()`.

The emitter resolves valid recipient sessions at send time. Revoked/taken-over/expired sessions receive no further game invalidations even if an old socket retains a cached subscription. A new session gets a different topic. Terminal delivery must deliberately include legitimate finishing participants (including status `completed`) before recipient cleanup; host-end must emit to authorized pre-termination recipients before revoking them. This ordering needs transaction tests against the latest finalization/termination functions.

A shared room topic is simpler but should be approved only with an explicitly accepted bounded revocation window and short capability lifetime. Random/unguessable topic strings alone are not authorization.

## Commit and publication strategy

Prepare a dedicated reviewable migration; apply it only after approval. Keep custom objects in an application-owned private schema, not in `realtime`.

Recommended emission boundary: an AFTER INSERT/UPDATE trigger on JOKER `public.games`, firing only for authoritative version/lifecycle transitions. Call `realtime.send` with the allowlisted object and private flag true; do not pass database rows. Verify coverage of bootstrap, human CAS, worker CAS, bots, finalization and host termination. Equivalent duplicate command replay does not update the row, therefore does not emit a fresh mutation event.

The database send inserts its notification within the game transaction; normal transaction rollback also removes that insert. WAL delivery follows committed writes. This avoids an application HTTP broadcast occurring before commit or being skipped when a process dies after persistence. There is no need to add `public.games` to the client-facing Realtime publication.

Broadcast is a wake-up optimization, not an exactly-once durable command queue. Missing partitions, service outages, delays and missed events are possible. Supabase documents that a client connection creates daily message partitions and `realtime.send` alone does not. Validate startup/no-listener behavior and warnings in staging. Notification failure must not invalidate an otherwise legal game move. If stronger delivery guarantees are needed, add a small private sanitized transactional outbox and independent bounded dispatcher in a later reviewed stage; polling already supplies recovery.

Database trigger overhead and per-session fanout must be measured. Do not put an external HTTP call, raw canonical serialization or lengthy authorization workflow inside the game transaction.

Room/lobby metadata is a separate version stream. Initially keep its existing refresh path. If room closure/host departure cannot be observed through a final game-state change, add a separate sanitized `room_version`/closure notification with its own authorization and terminal recipients; never pretend game state versions cover unrelated room-only changes.

## Client lifecycle and recovery

Integration boundary: a service subscription invokes the existing `refreshAll(true)` wake-up path. Rendering never talks directly to Supabase tables.

- Subscribe only after an authorized game projection establishes game identity. Capability issuance must independently verify membership.
- On SUBSCRIBED, immediately fetch a fresh authorized snapshot to close the load-to-subscribe race.
- On event, validate contract/game identity, deduplicate/coalesce and refresh through single-flight. Preserve ordered presentation journals and optimistic local ownership.
- Keep existing polling during initial rollout. Realtime must not be the sole driver of bot reconciliation, deadline release or deal fallback. Slower recovery polling can be benchmarked separately once a durable worker is proven sufficient.
- On failure/timeouts, retain polling and retry subscription with bounded backoff/jitter. Do not block player commands waiting for the socket.
- On hide/background, cancel only obsolete presentation ownership according to existing lifecycle, and suspend unnecessary refresh work. On foreground, renew capability, reconnect if needed and perform fresh authoritative hydration. Do not replay notification history as animation history.
- On route/game change, unmount, logout, room closure or takeover, invalidate the generation, remove channels/listeners, cancel renewal timers and ignore old callbacks. Reject snapshots from stale generations.
- Notifications arriving during animation may fetch immediately; visual ordering remains the journal's responsibility. They do not acknowledge another player's presentation.
- Reconnect after missed events reconstructs from the authorized current projection/public tail. If the public tail cannot represent every missed play, hydrate settled state rather than inventing cards.

## Instrumentation without private payloads

Record monotonic client durations for input-to-local-feedback, command request/response, notification receipt-to-projection response, projection admission-to-first remote frame, frame gaps, long tasks and queue depth. Tag only public version/renderer phase and coarse platform; avoid room codes, capabilities and hidden cards.

`emittedAt` in a database trigger is an emission timestamp, not an exact commit timestamp. Cross-device wall clocks are not synchronized. Do not subtract timestamps from different devices and report precise network latency. Commit-to-notification needs server instrumentation/tracing or a measured clock-offset uncertainty; end-to-end remote visibility needs paired-client test orchestration. Existing deterministic polling tests are not production measurements.

## Required negative and reliability tests

Before infrastructure activation:

1. No cookie, malformed/revoked/expired session, inactive player and non-member cannot obtain a capability.
2. Forged player/game/session claims, wrong topic, wrong issuer/audience, expired JWT and another participant's topic cannot join.
3. Client Broadcast sends and Presence are denied. Public channels cannot receive private events.
4. Raw canonical tables/RPCs, deck order, entropy and other hands remain inaccessible with the capability JWT. Existing broad-policy bypass is tested.
5. Payload contains exactly the allowlist; malicious canonical extension fields never enter it.
6. Successful CAS emits; rejected CAS, command replay and rolled-back transaction do not emit committed mutation notifications. Worker/bot/finalization/termination paths are covered.
7. Session takeover and participant removal stop emission to the old recipient topic; terminal recipients receive one wake-up before cleanup.
8. Duplicates, lower versions, version gaps, far-future values and rapid bursts do not regress snapshots, duplicate animations or create refresh storms.
9. Notification during an in-flight fetch produces at most one queued follow-up; stale route/background callbacks cannot update a new room.
10. Dropped events, socket failures, token renewal failure, no listeners/daily partitions, offline return and room closure recover through polling/fresh hydration.
11. Two or more authenticated clients in a non-production test environment verify real authorization and commit-to-receive behavior. Unit mocks alone cannot validate PostgreSQL RLS/private Broadcast.
12. All three rulesets, human/bot turns, Joker, dealing and existing replay/ACK tests remain green. No ruleset information belongs in notification routing.

## Approval and activation checklist

This phase has no deployable Realtime infrastructure and no migration is applied. Safe client protocol/lifecycle tests can be implemented before infrastructure approval, with the subscription disabled by default.

Separate reviewed stage must contain: capability broker/server signing code; service-only identity RPC; recipient authorization lookup; narrowly scoped `realtime.messages` policy; sanitized trigger and terminal ordering; staging SQL and multi-client security tests; exact grants/revokes; rollback; measurements. Create a migration using the repository's Supabase CLI workflow rather than inventing a timestamp.

Owner approval is required before importing/configuring a signing key, setting server secrets, applying production policies/triggers, changing Realtime public-access settings or deploying the broker. Do not silently rotate the project's existing signing key. Verify policies and resource limits on the external owner project, then run advisors and read-back checks. Production activation is a separate explicit action.

## Current official documentation checked

The Supabase skill was read fully. Its requested lightweight changelog URL was attempted; the web tool rejected its markdown content type and shell network resolution failed. The official rendered changelog and Realtime-filtered/breaking-change entries were then checked instead, plus the Supabase MCP documentation search.

- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private channels use `realtime.messages` policies and JWT identity; permissions are cached until token refresh/expiry. RLS is already enabled on that table.
- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast): use `realtime.send` for custom sanitized objects. `broadcast_changes` includes row changes and is unsuitable for canonical game rows. Daily partition creation requires a client connection.
- [JWT support](https://supabase.com/docs/guides/auth/jwts): externally minted tokens can use imported signing keys and the client `accessToken` option. Custom JWTs should not be assumed compatible with Supabase Auth session/getClaims operations.
- [Signing keys](https://supabase.com/docs/guides/auth/signing-keys): imported keys require deliberate management and protection. Do not rely on extracting the existing managed private key.
- [Realtime schema lockdown, July 14, 2026](https://supabase.com/changelog/realtime-schema-locked-down-against-modification): custom objects cannot be created in `realtime`; RLS-policy management on `realtime.messages` remains allowed. Do not ALTER that table to enable RLS.
- [Official changelog](https://supabase.com/changelog?tags=realtime), [breaking changes](https://supabase.com/changelog?types=breaking-change): checked for relevant authorization/schema changes. Binary Broadcast changes are irrelevant to this deliberately small JSON contract.

The project's production key trust, policy configuration, publication contents and live Realtime resource limits remain unverified. This investigation makes no claim of measured live latency or successful authenticated private subscriptions.
