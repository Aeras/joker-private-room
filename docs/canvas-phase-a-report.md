# JOKER Canvas Phase A — review delivery

Base: GitHub main `f6aaed16018f99ab677b765b2b85e8dea207afe9`, including merged PR #244. Branch: `codex/joker-canvas-phase-a`. This is an ordinary-card gameplay migration and a Realtime investigation, not the complete Canvas/Realtime mission. No merge, deployment, Lovable call, dependency addition, migration or production database operation is included.

## Actual architecture and implementation

The existing `TrickPresentationJournal` still admits public snapshots, orders batched plays and retains completed tricks until collection. Existing callbacks still own landing sounds, presentation acknowledgements, score latching and collection completion. Server commands, legality, scoring, bots and deal barriers are untouched. The server releases legacy played-card barriers without requiring every client animation to finish; dealing barriers remain authoritative.

`CanvasTrickScene` is one pointer-transparent, viewport-sized Canvas per ordinary-card trick. It retains one engine across remote launches, resting poses, hold, stack and collection. Each authorized public card has one sprite identity. Canvas replaces the corresponding DOM surfaces; local optimistic flight remains a separate owner until its existing accepted-and-landed handoff. No React state update drives frames. The scheduler runs only for active animations; settled/held cards have no idle RAF loop.

`trickSceneMotion` reuses the actual `cardFlightPose`, measured seat origins, `TRICK_CARD_ROTATION`, `pinnedStackPose`, winner-directed `trickExitPoint` and existing timing registry. Normal remote/bot flight remains 340ms; hold/stack/collection remain 550/250/380ms. The collection easing samples the existing cubic-bezier(0.4,0,1,1), and its 120ms face/back crossfade and final fade window are preserved. Reduced motion keeps short landing movement and stationary collection fades.

Only public standard-card faces and the existing back are prepared. Preparation overlaps the existing artwork barrier, with a maximum 120ms additional Canvas readiness budget; slow/failed images choose DOM for that trick. Reconnect hydration waits for that decision rather than latching a cold-cache DOM choice prematurely. Prepared bitmaps are retained by the scene during motion even if cache entries are later evicted. Context loss relinquishes the whole scene to DOM. Runtime failure may restart or jump a DOM segment; this is a correctness fallback, not a claimed seamless failure animation.

An ordinary-only trick stays on one renderer. A trick containing a Joker retains DOM to preserve interleaved layers and FROM_BELOW. If a Joker is newly revealed during an ordinary Canvas flight, the flight finishes before the settled trick hands back to DOM. This intentionally leaves special Joker presentation for Phase C. No Joker rule or chooser changes are included.

All three rulesets share this renderer. Canvas never selects a deck, winner, trump, declaration, premia or strategy, and receives no opponent hand/deck order. DOM retains touch, keyboard and mouse input, the local hand, dealing, dealer selection, trump movement, Joker surfaces, avatars, chat, menus and scores. Accessible descriptions of Canvas cards remain in the DOM.

## Exact changed files

| File | Change |
| --- | --- |
| `src/components/table/canvas/CanvasTrickScene.tsx` | Shared ordinary-trick sprite owner, RAF lifecycle, pause/resume, resize, context loss and callbacks. |
| `src/components/table/canvas/trickSceneMotion.ts` | Renderer-independent remote flight, stack, collection and reduced-motion poses. |
| `src/components/table/TrickPresentation.tsx` | Public bitmap preparation, renderer selection and exclusive DOM/Canvas ownership; existing journal remains intact. |
| `src/components/table/canvas/engine.ts` | Explicit sprite-owner validation, front/back blend and active-frame diagnostics excluding deliberate idle holds. |
| `src/components/table/canvas/scheduler.ts` | Read-only active motion count for accurate idle handling. |
| `src/components/table/canvas/types.ts` | Bounded optional face/back blend. |
| `src/test/canvas-trick-scene.test.tsx` | Shared scene, four winners/viewers, geometry, callbacks, hydration, cancellation, background and context failure. |
| `src/test/canvas-trick-journal.test.tsx` | Real journal integration for all rulesets, batched serial launches, score latch release, hydrate/preparation and Joker/cold fallback. |
| `src/test/canvas-engine-scheduler.test.ts` | Blend, owner rejection and idle-gap regression tests. |
| `src/demo/canvasBrowserFixtureSource.ts` | Public completed-trick count for the canonical transport fixture. No app route imports it. |
| `scripts/verify-joker-canvas.cjs` | Existing real-GameTable browser harness now verifies shared ownership and three consecutive tricks in every ruleset; recovery includes shared-context failure. |
| `docs/joker-realtime-architecture.md` | Parallel source/security investigation and staged infrastructure requirements. |
| `docs/canvas-phase-a-report.md` | This report. |

## Verification

Commands:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <changed TS/TSX files> --rule 'prettier/prettier: off'
node node_modules/vite/bin/vite.js build
node scripts/verify-joker-canvas.cjs <external-playwright-module>
```

- Full regression: **159 files / 1,039 tests**. This includes JOKER rules, bots, projection/security, presentation and unrelated existing DURAK regression coverage. No DURAK source is changed.
- Focused new/extended Canvas scene, journal and engine tests: **30 tests**. All four collection winners and all four viewer coordinate mappings are covered deterministically.
- Strict TypeScript and production build pass. Scoped lint has no errors; the pre-existing `active` dependency warning in TrickPresentation remains.
- Chromium browser fixtures use the real GameTable, actual artwork and canonical dispatcher/bot planner, with simulated transport. Eight scenarios cover three rulesets, a 900ms server response, acceptance/rejection, native Chromium touch, reduced motion, cold fallback, resize, synthetic blur/focus, context loss and remount. Three consecutive fully collected tricks are checked in **each** ruleset. The page has no horizontal/vertical scrolling. Local and canonical owners are never simultaneously counted for the same card.
- Browser traces assert Canvas hold/stack/collection stages across successive tricks and one engine surface per ordinary trick. Rejection phase is observed through mutation history so the test does not miss its short visual window during screenshot processing. Shared-scene context loss must detach Canvas and leave the public trick on DOM.
- Browser findings fixed: hydrated renderer selection initially occurred before preparation finished; a regression test now protects this. A first rejection assertion could miss the already-completed return; the harness now records the actual phase rather than extending gameplay timing.
- Review outputs: `.test-tmp/canvas-game-results.json`, `.test-tmp/canvas-three-tricks-*.png`, and `.test-tmp/canvas-video/*.webm`. These generated files are not committed. A copied recording can be supplied outside the repository.

This is headless Chromium with deterministic transport, not authenticated live multiplayer or physical Android/iPhone/Safari testing. Browser animations were exercised and a recorded collection frame inspected; device-specific GPU, PWA and WebKit behavior remains unverified. No production latency result is claimed.

## Performance evidence and limits

One shared Canvas per ordinary trick avoids allocating separate viewport surfaces for its four cards and retains ownership through collection. The maximum backing area remains approximately four million pixels per Canvas, DPR at most two; the separate optimistic local surface can coexist for a different card. The bitmap cache remains bounded at 16 entries. These are structural bounds, not total-browser-memory measurements.

Diagnostics report frame count, maximum active-frame gap and synchronous paint time. The idle-gap regression test proves the intentional hold/network wait is not reported as a slow active frame. Browser output contains actual measurements, including frame gaps above a 60Hz budget during concurrent QA workload; those must not be concealed or interpreted as physical-device performance. There is no matched physical-device Canvas-vs-DOM benchmark yet, so this phase makes **no claim that Canvas is faster than CSS**. The architecture is justified by one visual owner, fewer surfaces, reusable profiles and bounded lifecycle; rollout performance still needs matched profiling.

Final headless run (maximum across the reported scenes; synchronous paint is cumulative per scene, not per-frame or GPU time):

| Ruleset | Consecutive tricks | Maximum active gap | Maximum cumulative scene paint |
| --- | --- | --- | --- |
| Popular | 3 | 16.8ms | 23.2ms |
| Classic | 3 | 16.8ms | 19.0ms |
| Minus | 3 | 50.0ms | 19.3ms |

Recorded scene frame counts reached 104–105. The Minus gap is an observed dropped-frame interval, not a passed device smoothness target. Previous concurrent runs observed 33.4–66.7ms maxima. Instrumented headless testing and screenshot/video capture affect workload; use these results to establish reproducibility, not to advertise a performance improvement.

## Multiplayer and Realtime

No live transport, polling interval, server command or database changes are made here. Existing polling and monotonic projection admission remain the source of authorized updates. Public journal buffering is renderer-independent.

The PIN system provides an opaque HttpOnly custom session, not a Supabase Auth JWT. A publishable key cannot authorize participant-specific private Broadcast. The [Realtime architecture report](joker-realtime-architecture.md) specifies a reviewed short-lived room/session capability broker, receive-only policies, transactional sanitized invalidation and current-session recipient fanout. Raw canonical `public.games` subscriptions or row broadcasts are prohibited. Notifications wake the authorized projection fetch; they never act as game state.

Required next infrastructure stage: signing-key trust and server broker, service-only identity lookup, narrow receive policies, sanitized transactional emitter covering human/bot/worker/finalization/host-end paths, staging authorization/revocation/rollback tests and paired authenticated clients. Prepare that migration separately; production configuration, application of policies/triggers and deployment require explicit approval. **No migration has been prepared or applied in this presentation PR.**

## Next stages

1. Review this PR and real-device recording. Keep DOM fallback and investigate exception-path visual continuity separately.
2. Phase B: dealer selection, dealing, trump/hand reveal and reflow, preserving asset barriers and input accessibility.
3. Phase C: Joker interleaved scene layers, stationary chooser, competing Jokers and FROM_BELOW; then remove the deliberate Joker-trick DOM fallback.
4. Separate Realtime infrastructure PR with staging security tests; activate only after approval and retain polling recovery.
5. Matched Canvas/DOM mobile profiling, frame percentiles, long tasks, memory and paired-client input/commit/notification/projection/frame telemetry. Remove old renderers only after equivalent behavior is verified.
