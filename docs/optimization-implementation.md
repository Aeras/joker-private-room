# Optimization implementation progress

Baseline: GitHub main `67896a89152e27fb0cff27bd568c41834551e0f0` (PR #84).
This is an implementation ledger, not a completion claim. Unresolved P0 work remains.

## Phase 1 — motion ownership and snapshot freshness

- OPT-001: acceptance no longer restarts the detached flight. CSS transform completion (bounded fallback) and authority confirmation are both required. Rejection has a separate return. The canonical surface starts landed after handoff; local fourth-card hold waits for the flight.
- OPT-009: canonical versions are monotonic, equal-version room updates are accepted, old route callbacks are rejected, and failures predating a successful newer response do not disconnect the table.
- OPT-011: card faces have two surfaces; flip/collection CSS use the timing model's durations. Collection and clear wait for all four transition completions, with per-surface bounded fallback. Normal 850 ms hold and current readability beat are preserved.
- Diagnostics now report remote settle and flip values from the same model.

Verification:

- `vitest run src/test/optimization-motion-ownership.test.tsx src/test/optimization-snapshot-admission.test.ts src/test/jk004-trick-lifecycle.test.ts`: 12 passed.
- `vitest related src/components/table/TrickPresentation.tsx src/components/table/LocalFlightCard.tsx src/routes/table.tsx src/lib/timingDiagnostics.ts --run`: 15 passed.
- Strict TypeScript and production client/SSR build passed; directly affected ESLint checked.
- Actual Edge browser, isolated real components/artwork/CSS: normal local acceptance at 0 and 50 ms produced one transition and settled after CSS end (~327/340 ms); acceptance after landing at 600 ms settled at ~606 ms without another transition. Rejection used bounded fallback safely. Reduced-motion trick surfaces produced four flip completions then four collection completions, with no remaining overlay. Browser reduced-motion preference was enabled; normal trick durations/850 ms hold were verified by component tests, not a normal-motion browser/device run.
- Temporary QA page and Vite configuration are excluded from commits and do not change the product build.

## Reconciliation / remaining status

### Phase 2 — ordered journal and interruption recovery

Every unseen completed trick is queued in canonical order using game/deal/ordinal identities. Collection owns retirement of the active entry. A bounded 18-trick public tail survives canonical next-deal resets; it contains only played cards and authoritative winners. Fresh mounts hydrate the current snapshot without replaying all history. Live backlog is capped at 24 entries, with explicit settled-snapshot recovery for longer absence; the journal records catch-up counts.

Geometry revisions preserve the journal, completion stages and local flight. Remote travel and collection freeze viewport coordinates; landed surfaces rebase. Blur pauses the cursor and focus/visibility resume a completion generation. Dealer/deal cancellation cannot acknowledge, and same-key focus resumes. A server fallback changing a nine-card stage clears the cancelled overlay. The table keeps trick presentation mounted through deal transitions and blocks local inputs while visible history is pending. Appended Joker announcements no longer restart the head announcement's three-second lifetime.

Verification: 9 new ordered/recovery/domain tests and 6 motion tests passed. The related domain/projection run passed 103 tests; its 7 deployment-artifact tests initially could not launch Bun. Running those with the installed platform Bun executable passed all 7. Strict TypeScript and the production build passed. Affected presentation ESLint has no errors/warnings. Actual Edge browser with reduced motion showed three consecutive tricks, 12 landings, 12 flips and 12 collections, and no remaining overlay. Physical-mobile orientation/fullscreen and normal-motion multi-human acceptance remain required.

Phase 3 remains open: ordinary later deals and aggregate/scoped presentation acknowledgement. The pass is not complete.

| OPT | Current disposition | Remaining work |
|---|---|---|
| 001 | PARTIAL | Phase 1 fixes motion handoff; geometry/recovery integration still to verify in Phase 2 |
| 002 | PARTIAL | All-unseen queue, public outgoing tail, visible cursor and catch-up policy |
| 003 | PARTIAL | Explicit interrupted/resume ownership for dealer/deal |
| 004 | PARTIAL | Scope and aggregate nine acknowledgements, recover superseded presentation; ordinary later-deal eligibility |
| 005 | PARTIAL | Geometry rebasing without destructive reset |
| 006 | PARTIAL | Decoded critical readiness and retry |
| 007 | PARTIAL | Reviewed avatar derivatives and identity-preserving URL resolution |
| 008 | PARTIAL | Transform-only deal travel |
| 009 | FIXED | Phase 1; multi-client/reconnect browser acceptance remains |
| 010 | PARTIAL | Remove 50 ms producers; phase-aware readiness |
| 011 | FIXED | Phase 1; normal-motion physical mobile acceptance remains |
| 012 | PARTIAL | Memory capture / safe batching |
| 013 | PARTIAL | Collapsed composer, hand lane and manual landscape fallback |
| 014 | PARTIAL | Shared reveal/playable geometry and frame cleanup |
| 015 | SKIPPED — measurement required | Compare 650 ms and current cadence after correctness |
| 016 | PARTIAL | Local landing cue fixed; remote semantic milestone needs listening |
| 017 | PARTIAL | Latest wake derivation must preserve blocked startup exclusions |
| 018 | DO NOT CHANGE | Shared URLs/request coalescing retained |
| 019 | DO NOT CHANGE | Coalesced geometry, bounded audio, one release rectangle read retained |
| 020 | PARTIAL | Same-dimension compression and DPR comparison |
| 021 | SKIPPED — measurement required | Baseline production build now available; no demonstrated restructuring need |
| 022 | SKIPPED — measurement required | No measured drag-render bottleneck |

CUR-001/002/003 from the refreshed review remain P0 until later phases: superseded deal active flag, unscoped acknowledgement, and first-client/fallback eligibility. No claim is made that the full optimization pass is complete. No schema/deployment changes have been applied.
