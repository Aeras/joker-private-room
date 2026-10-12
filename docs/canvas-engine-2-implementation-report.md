# JOKER Canvas Engine 2.0 — first integrated phase

Review base: GitHub main `7f3110ce84b5af1fca0d194ae2bd85565636a4f8`. Feature branch: `codex/joker-canvas-engine-2`.

This is an integrated foundation and one complete local-play flow, **not a completed migration of the whole table**. No Beta Lab, alternate rooms, game modes, dependency installation, production database change, migration, Lovable call, merge or deployment is part of this work.

## 1. Investigation

See [source investigation](canvas-engine-2-investigation.md) for the framework, routes, rulesets, server commands, authenticated projections, bots, artwork, presentation journal and timing boundaries. The important findings are:

- Gameplay is server-authoritative; rendering must consume authorized projections and optimistic local intents only.
- The live route uses single-flight polling. There is no active Supabase gameplay Realtime subscription to accelerate by merely adding Canvas.
- Bots already use two authenticated reads and one CAS write per normal request, with one automatic action per live request. That implementation and all strategy budgets remain untouched.
- Played-card acknowledgements do not globally gate progression in the current server. Ordinary/nine-card deal barriers still do; Canvas does not change them.
- Recent main changes start the hand face down, revealing after **125ms + 16ms per card**. Two responsive-hand tests still expected immediate face-up display. Their assertions now reflect main, without changing hand rendering or flip timing.

## 2. Implemented modules

| Module | Responsibility |
| --- | --- |
| `src/components/table/canvas/types.ts` | Sprite poses, card bitmaps, injectable frame driver and finite-geometry validation. |
| `scheduler.ts` | Elapsed-time RAF scheduling, exactly-once completion, replacement/cancellation, background suspension and disposal. Active motions are bounded at 32; no React updates per frame or idle RAF loop. |
| `engine.ts` | Canvas 2D card drawing, sorted layering, rounded artwork clipping, supplied front/back flip primitive, responsive backing store and diagnostics. Maximum 64 sprites; DPR capped at 2 and backing area near four million pixels. |
| `projectionAdapter.ts` | Explicit authorized scene allowlist, version deduplication and ordinary local-flight instruction. Ignores injected canonical hands/deck/secrets; hidden own hands remain hidden. Reuses existing measured geometry, rotation and `cardFlightPose`. |
| `assetCache.ts` | Separate bounded 16-image pool using the existing DOM preload and resolved-artwork path. Draw only ready bitmaps; cold/failing resources remain on DOM. Eviction/clear cleans pending image handlers. |
| `inputAdapter.ts` | Tested intent bridge for future Canvas hit targets. Only current legal own-hand human intents are forwarded. Current integration retains the proven DOM pointer, keyboard, double-click and Joker input instead of duplicating hit handling. |
| `CanvasLocalFlight.tsx` | Lifecycle bridge to existing landing/acceptance/rejection callbacks, sound keys, background/resize/context-loss handling and single-owner rendering. |
| `LocalFlightCard.tsx` | Existing DOM renderer preserved; chooses Canvas once per eligible mounted flight and supplies a DOM fallback. Guards landing/settlement delivery across a fallback. |
| `TrickPresentation.tsx` | Warms only authorized visible own faces through the scene adapter and passes the authorized projection to the existing local-flight seam. Public journal and canonical-card suppression are retained. |

## 3. Real gameplay flow

An ordinary human card is played with the existing touch drag, mouse double-click or keyboard control. `GameTable` creates its optimistic presentation token and calls the existing authorized command callback. If the face is prepared and Canvas 2D is available, Canvas owns the visual copy immediately; the hand and canonical trick surface do not also draw that card.

Normal motion uses the current 300ms quadratic played-card profile; reduced motion uses 75ms and at most 12px of movement near the destination. Acceptance does not reset the frame clock. Landing waits independently for authority; a landed submitted card remains visible without an idle loop. Rejection replaces the outgoing animation with a return from its current pose and restores the hand through the existing callback. Canvas never changes ownership, scores or turn order.

Joker, leading Joker choices and FROM_BELOW stay on DOM. Unsupported contexts, cold artwork and the build-time `VITE_JOKER_FLIGHT_RENDERER=dom` override also stay on DOM for the entire flight. A runtime context loss switches to DOM from the last measured pose; its fallback segment may use an additional existing DOM flight duration. Correct completion takes precedence over seamless failure-path timing.

All three rulesets share these modules. No Canvas code selects a deck, winner, trump, bid, legality or score. Bot/remote play, dealer/dealing, hand reveal/reflow, trump and collection remain on their existing renderer until separately migrated. Generic sprite/flip/animation primitives prepare those stages but are not claimed as live implementations.

## 4. Multiplayer work and measurements

Added `tablePolling.ts`: when another human is acting in CARD_PLAY, observers poll every 500ms instead of 1500ms. Bot polling remains 200ms; local-human/idle waits remain 1500ms. Visibility checks, immediate bot follow-up, request coalescing, stale snapshot rejection and return synchronization remain in the route.

A controlled clock test detects a simulated accepted update on the 500ms tick rather than the previous 1500ms tick. This is **1000ms less polling wait in that scenario**, not a measured production/network latency reduction. Additional observer reads are the resource tradeoff; production monitoring is still required.

Canvas landing diagnostics now include frame count, maximum active-frame gap and accumulated synchronous paint time. These do not measure GPU completion or physical-device p95 frame time. Do not infer that Canvas is faster than CSS on every device.

Raw Realtime changes on canonical state tables were deliberately not introduced: they could leak hidden hands/deck. An authenticated, sanitized notification contract needs publication/security review before migration and production work; polling remains the missed-event/reconnect recovery path.

## 5. Verification

Local commands (using the workspace's Node/Bun runtime where necessary):

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <changed TypeScript/TSX files> --rule 'prettier/prettier: off'
node node_modules/vite/bin/vite.js build
node scripts/verify-joker-canvas.cjs <path-to-playwright-module>
```

- Full local suite: **157 files, 1017 tests passed**. Includes canonical rules, simulation, multiplayer, security, assets, Joker and DURAK regressions.
- Focused rendering suite: **31 files, 224 tests passed**; 32 new Canvas/adapter/asset/lifecycle/polling tests.
- Strict TypeScript and production build pass. Scoped lint has no errors; the existing `active` hook warning in TrickPresentation and two existing emoji-effect warnings in the table route remain.
- Browser: eight successful real-component/canonical-dispatcher fixtures using actual card and avatar assets. Popular, Classic and Minus accepted plays; 900ms authority delay; rejection; reduced motion; cold-image fallback; native Chromium touch input; combined resize, simulated blur/focus/context loss and React remount recovery. Landscape 844x390 and 568x320, with resize to 800x370. Pixel assertions verify nonblank colored artwork, opaque normal flight, actual spatial movement, one command and no simultaneous local/canonical surface. Bot continuation remains legal and the page does not scroll.
- Reproducible browser script is committed. Its transport fixture source lives under `src/demo`, is read only by that script and is never imported by application routes. It renders the real GameTable and runs the canonical dispatcher; it is not a second app or a Beta Lab. The script serves built files to a private headless browser via route interception; no live backend/PIN is used. Playwright is supplied externally, not added to runtime dependencies. `CANVAS_BROWSER_EXECUTABLE` and `PLAYWRIGHT_BROWSERS_PATH` can select an already-installed browser/runtime.
- Outputs: `.test-tmp/canvas-game-results.json`, screenshots and `.test-tmp/canvas-video/*.webm`. A local video copy is delivered outside the repository as `JOKER_Canvas_First_Integration.webm`.
- Development issues resolved: an exact-optional-property type error in the asset cancellation field; stale face-up hand expectations inherited from main; browser recorder initially lacked its runtime path; initial reduced-motion pixel sampling occurred before a painted frame; recovery QA initially confused Canvas detachment with completion of the DOM fallback. Final assertions wait for the appropriate owner rather than weakening command correctness.

## 6. Remaining risks / next phases

1. Review and approve this branch before merge. Do not publish automatically.
2. Physical Android PWA and iPhone Safari/standalone are unverified. Inspect DPR sharpness, memory, frame p95 and input-to-first-paint on weak devices. WebKit/Safari automation and authenticated production multiplayer were not available in this test run.
3. Migrate remote/bot card flight next through the ordered journal, with identical geometry and exactly-one-owner handoff tests. Then migrate trick hold/stack/collection as one sequence, preserving score latching.
4. Migrate dealer/deal/trump and the full hand only after preserving their acknowledgements, asset barriers, overlap, clipping, flip interruption and accessibility. Current resize recovery preserves the frozen in-flight geometry; a future shared persistent canvas may need a deliberate geometry rebase policy.
5. Migrate Joker separately, with stationary choice, fullscreen portal, lower layering, mandatory-highest/trump semantics and dual-Joker rules still server-owned.
6. Consider a persistent shared Canvas layer and broader input hit-testing only after benchmarks demonstrate benefit. Current per-flight canvases stop between moves and have bounded backing stores/bitmap pools, but allocation/compositing on real mobile devices is not yet profiled.
7. Review observer polling load before shortening further. Design sanitized Realtime invalidations only with explicit schema/security review; do not stream canonical rows. Extend diagnostics to physical-device frame percentiles, long tasks and end-to-end transport timing.

## 7. Delivery constraints

The feature has small foundation/integration/polling/report commits. The review PR's head SHA and CI results are the canonical delivery identity. No files in another repository/project, no production state and no application deployment have been touched.
