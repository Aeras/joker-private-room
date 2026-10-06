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

Phase 3 below addresses ordinary later deals and aggregate/scoped acknowledgement. The overall pass remains incomplete for the architectural risk described below.

### Phase 3 — canonical presentation eligibility

Ordinary deals now have an explicit `DEAL_PRESENTATION` boundary with no actor, declaration eligibility or human deadline. Existing nine initial/remainder stages remain canonical. Acknowledgements include deal/stage and use authenticated viewer identity; all human-owned seats must complete. Concurrent acknowledgement CAS retries retain the other seat's completion. Delayed earlier-stage/deal acknowledgements are ignored rather than releasing a newer barrier. A hand-reveal completion window is acknowledged only while visible and landscape, without depending on projection identity. Deal 1 keeps its existing aggregate startup barrier and then exposes the own-hand reveal under the same non-interactive ordinary boundary.

The existing durable `presentationReadyAt` mechanism remains. Its fallback now includes a bounded 30-second delivery/reconnect allowance beyond the presentation budget. This allowance is an explicit absent-client policy; it cannot guarantee that an arbitrarily slow/absent device finished presentation. Physical multiplayer acceptance must validate this boundary and takeover/reclaim behavior before production use.

The CLI-created owner-applied migration restores blocked startup wake exclusions and schedules ordinary barriers at their fallback instant. It has not been applied to any database. `supabase/tests/optimization_presentation_wake.sql` is a read-only transactional acceptance check for the owner after applying the migration; it has not been executed here.

Verification: 9 behavioral barrier/protocol tests cover human/bot first actors, human aggregation, scoped stale acknowledgement, reconnect/idempotency, CAS race and zero-client fallback. Together with ordered presentation, solo timeout and compiled worker tests, 30 passed; 71 related tests passed. TypeScript and production build passed before the final Deal 1 reveal integration, which requires the subsequent phase verification.

Remaining architectural risk: ordered visible delivery is now lossless within its bounded journal, but canonical turn deadlines are not leased to each client's visible trick cursor. A delayed client can still spend part of a turn catching up. A server-owned per-turn presentation contract needs review and multi-client timing evidence; this draft does not claim that this P0 interaction-readiness risk is eliminated. Do not substitute larger arbitrary sleeps or a client rules engine for that contract.

### Phase 4 — decoded assets, runtime producers and compression

The existing shared cache and canonical PNG registry identities remain. Readiness means decoded success, with retryable/terminal failure distinguished, one coalesced request, two bounded attempts and original-PNG fallback. Dealer/deal and active-trick presentation wait for a small immediately required set, not the full deck. Semantic fallback releases the readiness gate after terminal failure. Already-cached images still await decode. Real artwork no longer becomes ready solely from an image `onLoad` handler.

Normal dealing animates only transform from a fixed source origin; card order, destination, stacking and cadence are unchanged. Empty chat expiry uses no timer and live chat schedules only the next expiry. Startup completion uses explicit completion events and a bounded in-memory completion marker when storage is denied, replacing 50 ms marker polling. Readiness polling stops outside startup. Equal-version snapshot admission additionally rejects older request metadata.

Diagnostics capture at most 800 events in memory and persist in 500 ms batches/pagehide/export paths; animation callbacks do not parse or rewrite localStorage. Actual local/remote landing and completed collection milestones are recorded. Both local and remote play sounds use landing, with existing bounded audio deduplication unchanged.

`scripts/optimize-table-assets.py` preserves every original. 39 card WebPs and the background preserve source dimensions and exact decoded RGBA pixels; 9 table-avatar derivatives use 256×256 WebP. Table-only URL resolution is limited to reviewed local avatar identities; arbitrary external/custom URLs remain unchanged and the original URL is the image-error fallback. Combined originals are 26,734,116 bytes and derivatives 4,842,790 bytes. Manifest/source hashes and 147 DPR 1/2/3 resampling comparisons are in the two JSON documents. All 40 full-resolution lossless images were independently compared byte-for-byte after decoding; avatar DPR 3 comparisons were visually reviewed in the contact sheet. This is target-density artifact comparison; physical-device DPR browser testing remains pending.

Verification: 35 related runtime tests; 54 targeted assets/ruleset/identity/freshness tests; 23 motion/ordered/runtime tests after final scope correction passed. TypeScript, production client/SSR build and affected-file lint passed. Browser confirmed decoded `/cards/optimized/card_back.webp`, fixed left/top origin and transform-only normal dealing. The existing 500 ms deal cadence and 850 ms trick hold remain. Already-dealt first-hand reveal uses a separate completion scope and cannot suppress its server acknowledgement.

### Phase 5 — shared reveal geometry and responsive composition

Reveal and play use the same keyed draggable nodes, widths and overlap; only the two-sided face wrapper flips. Both nested animation frames are cancelled on teardown. The measured local-seat rectangle reserves the hand lane, and hand/trick dimensions account for landscape height. Remote travel and collection freeze dimensions as well as coordinates. The permanent bot composer is collapsed by default with a deliberate drawer; passive messages do not capture pointer events. New labels use the locale dictionary. Existing seat/deal anchors and the coalesced geometry architecture remain.

Verification: 27 focused hand/motion/ordered/geometry tests and 26 related tests passed. The final combined optimization behavioral suite passed 43 tests. The compiled worker, solo-human and barrier/hand run passed 26 tests. Direct installed TypeScript compiler passed; production client/SSR build passed. Five reformatted phase-5 files pass full ESLint; the two previously compact motion files pass ESLint with only the formatter rule disabled. An initial npx tsc attempt could not resolve its binary and tried a blocked registry request; the direct installed compiler completed successfully instead. Browser QA used real components/artwork at 568×320 and 800×400: nine cards fit the measured reserved lane, no textbox exists while collapsed, and opening/closing the composer works. Temporary viewport override was reset. Physical-mobile safe-area, fullscreen and multi-client acceptance are still required.

Timing tuning is intentionally not chosen yet: the user requires correctness first, and the per-turn visible-cursor/deadline contract remains unresolved. Keep 1000ms after actual landing, include 650ms launch-to-launch as the comparison candidate, and retain the useful 850ms completed-trick hold.

| OPT | Current disposition | Remaining work / qualification |
|---|---|---|
| 001 | FIXED | Continuous flight, accepted/landed handoff and rejection; physical-device acceptance pending |
| 002 | PARTIAL | Ordered journal/public tail fixed; per-turn canonical eligibility is not leased to visible cursor; bounded long-absence catch-up |
| 003 | FIXED | Explicit interrupted/resume generation; completed stages idempotent |
| 004 | PARTIAL | Ordinary and both nine stages scoped/aggregate; durable fallback remains an absent-client policy; DB/device acceptance pending |
| 005 | FIXED | Journal survives geometry revisions; motion freezes coordinates AND size, then rebases |
| 006 | FIXED | Coalesced decoded critical readiness, bounded retry and PNG/semantic fallback |
| 007 | FIXED | Nine reviewed 256px table derivatives; originals and identity mappings preserved |
| 008 | FIXED | Fixed-origin transform-only normal deal, original cadence retained |
| 009 | FIXED | Monotonic canonical version, request order and route ownership |
| 010 | FIXED | Chat next-expiry scheduling, completion events, phase-aware readiness |
| 011 | FIXED | Two card faces, shared timings, all-four completion ownership |
| 012 | FIXED | Bounded memory capture, batched persistence, actual timing milestones |
| 013 | PARTIAL | Collapsed composer, measured hand lane and height-aware dimensions; physical landscape/fullscreen QA pending |
| 014 | FIXED | Same mounted draggable cards, final overlap/width for reveal and play; both RAFs cancelled |
| 015 | SKIPPED — measurement required | 650ms candidate versus current 1340ms normal launch interval after P0 contract resolution; 850ms hold retained |
| 016 | FIXED | Local and remote play cues at landing; listening/device acceptance pending |
| 017 | PARTIAL | Wake SQL prepared, owner application and SQL acceptance not executed |
| 018 | DO NOT CHANGE | Shared canonical identities/cache retained; no atlas |
| 019 | DO NOT CHANGE | Coalesced measured geometry, bounded audio, one gesture release read retained |
| 020 | FIXED | 40 same-dimension exact-RGBA derivatives; DPR 1/2/3 artifact review, physical-device acceptance pending |
| 021 | SKIPPED — measurement required | No demonstrated bundle restructuring requirement |
| 022 | SKIPPED — measurement required | No measured drag-render bottleneck |

Refreshed-review CUR-001 (superseded overlay) and CUR-002 (unscoped acknowledgement) have behavioral fixes/tests. CUR-003 is reduced by aggregate readiness and bounded fallback, but fallback/absent-client policy and per-turn presentation eligibility still require production acceptance. This is a draft implementation, not a completed optimization pass. No database migration or deployment has been applied.
