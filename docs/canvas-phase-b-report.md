# JOKER Canvas Engine 2.0 — Phase B review report

Base: GitHub main `e372d64fcde76e0a7f76b096e53bdac2279bc052`, including merged PRs #244 and #245. Branch: `codex/joker-canvas-phase-b`. Four implementation/verification commits are proposed for one review PR. No merge, Publish, deployment, Lovable operation, dependency installation, production database change, migration or authentication change is included.

## Actual architecture and boundaries

The original presentation controllers still own the authoritative public sequence, cadence, sounds, completion markers and acknowledgement callbacks. `DealerSelectionPresentation` consumes the server's resolved first-recipient seat and public sequence ending in the first Ace. The renderer never chooses a dealer or shuffles a deck. `DealPresentation` retains normal/initial/remaining stage policy, all four seat mappings, frozen geometry, first-hand release, trump placement and the existing dealing barriers. Domain/server code is unchanged.

New `CanvasPresentation` reuses `CardCanvasEngine` and `MotionScheduler` rather than adding a second rendering framework. A scene owns bounded sprites, explicit layers and one scheduler. No React updates drive animation frames, and settled scenes have no idle RAF loop. The dealing scene remains mounted across the nine-card choice boundary, keeping retained backs on the same Canvas before the remaining 24 flights. Public projections and counts alone supply that scene.

`useCanvasArtwork` chooses the renderer once per scope with a maximum 120ms preparation budget. Slow/failed preparation retains DOM for that scope. It does not toggle from DOM to Canvas during an active hand reflow. The hand scope explicitly includes game/deal identity; concealed or unsupported hands do not warm or draw faces. Existing optimized artwork and the bounded 16-entry bitmap cache remain in use. A very long dealer sequence or cache pressure can still choose DOM; fallback is intentional.

The motion budget was increased from 32 to **64**, matching the existing 64-sprite cap: a nine-card deal can move 36 backs together. The previous budget would silently fail during that handoff. A positive 36-card test and browser fallback observer now protect this. Fully offscreen sprites are culled from drawing while their elapsed-time clocks still finish normally.

## What now runs on Canvas

- Initial public dealer-selection flights, opening card and piled revealed cards. The final dealer label remains DOM UI.
- Dealer-source backs, deck-to-seat flights, overlap piles, normal dealing and both stages of chooser-style nine-card dealing. Retained non-chooser piles survive the choice boundary without renderer replacement.
- Exposed trump flip and deck movement to the measured indicator. The flip starts at the preceding deck's exact center. A stationary ready back preserves identity while the renderer prepares; the card never disappears into an empty preparation gap.
- Local hand faces/backs, entrance, delayed flips, overlap/fan expansion, sorting/repositioning, reflow after removal, dragging, selected emphasis and opaque disabled-card shading. Joker artwork in the hand uses the same renderer; its existing stationary chooser gesture is preserved.
- Existing Phase A ordinary local/remote/bot flights and trick collection remain integrated and unchanged in responsibility.

Normal timing remains 350ms cadence / 308ms deal flight, 600ms hand entrance, reveal start 125ms + 16ms/card, 340ms hand flip, 250ms reflow and 400/500ms trump flip/move. Existing easing curves are sampled directly. Handoff travel and fade are distinct: travel ends at 600ms, fade runs from 600 to 950ms, and the original controller's longer settle/tail barrier is preserved. Reduced-motion hand travel/flip uses short movement/fades while the original gameplay eligibility barrier remains intact.

## Intentional DOM input and visual ownership

`DraggableHandCard` retains pointer capture, touch thresholds/flick policy, double-click, Enter/Space, legal/blocked state, retry/duplicate protection, measured release geometry and the existing command callback. Canvas never confirms a move or submits a new kind of command.

While Canvas owns a card, its DOM artwork is invisible but preserves the established box dimensions, accessible role, name and keyboard focus. DOM/CSS visual transitions and WAAPI hand reflow are disabled for that owner. The engine updates the invisible hit wrapper's transform/layer alongside the rendered pose, without React frame updates or per-frame layout reads. Pointer/reveal/layout events supply geometry; position and flip use independent elapsed-time axes, so a flip does not restart entrance/reflow. Direct pointer poses cancel reflow rather than being overwritten by its next frame.

Keyboard focus originally scrolled a clipped container and separated an input target from its Canvas image. The table now uses `overflow: clip` where supported; hand Canvas falls back to DOM on platforms that report this clipping feature unsupported. Browser tests compare painted card centers with DOM hit centers and repeat the check after keyboard focus. Input wrappers clean their transient transforms/layers on fallback/unmount.

The hand Canvas is portalled into the existing fullscreen root, avoiding the transformed hand row becoming its fixed-position containing block. Chat, scoreboards, menus, avatars and controls remain DOM. No new application, route, Beta Lab or player-facing renderer mode is added. `VITE_JOKER_FLIGHT_RENDERER=dom` remains the internal full fallback override.

## What remains on DOM / limitations

- Static opponent backs and the settled trump indicator remain their existing DOM components. Their movement is handled by the Canvas presentation before the settled handoff.
- Joker-specific trick interleaving, FROM_BELOW and special flights remain Phase C. The chooser itself is unchanged DOM UI.
- Slow/cold artwork, unsupported Canvas/clipping and context failures retain the original renderer. Failure paths can snap or restart a segment; seamless context-loss animation is not claimed.
- Existing dealer/deal controllers may restart an unfinished public ritual after interruption. Completed-marker and route return hydration prevent historical replay and duplicate acknowledgement; resume-at-beat checkpointing is still a follow-up.
- This is shared engine infrastructure with persistent per-ritual/hand scenes, **not one global table Canvas**. Separate hand/local/trick layers can coexist. Consolidation is deferred until matched device profiling justifies the layering/cancellation risk.

## Exact files changed

| File | Responsibility |
| --- | --- |
| `src/components/table/canvas/CanvasPresentation.tsx` | Bounded scene bridge, replacement/cancellation, lifecycle and diagnostics. |
| `src/components/table/canvas/useCanvasArtwork.ts` | Scoped renderer decision and actual CSS width measurement. |
| `src/components/table/canvas/dealSceneMotion.ts` | Shared public deal/selection/handoff poses and seat mapping. |
| `src/components/table/canvas/handSceneMotion.ts` | Independent hand position/flip clocks and direct-input replacement. |
| `src/components/table/canvas/CanvasTrumpMotion.tsx` | Center-preserving flip, measured deck placement and once-only completion. |
| `src/components/table/canvas/engine.ts` | Motion cancellation, opaque shading/emphasis and offscreen culling. |
| `src/components/table/canvas/scheduler.ts` | Bounded 64-motion capacity for whole-deal handoff. |
| `src/components/table/canvas/types.ts` | Validated optional shading/emphasis fields. |
| `src/components/table/dealtCardMotion.ts` | Reusable exact cubic-bezier progress; existing CSS profile preserved. |
| `src/components/table/DealerSelectionPresentation.tsx` | Canvas visual owner and ready/public sequence preparation. |
| `src/components/table/DealPresentation.tsx` | Shared deal scene, retained piles and prewarmed public trump. |
| `src/components/table/TrumpDeckMotion.tsx` | Canvas/DOM seam and continuous ready-back placeholder. |
| `src/components/table/LocalHandRow.tsx` | Authorized Canvas hand, scene scoping, portal and synchronized hit geometry. |
| `src/components/table/DraggableHandCard.tsx` | Existing input retained; visual observations and exclusive artwork owner. |
| `src/components/table/GameTable.tsx` | Explicit game/deal hand scope and focus-safe viewport clipping. |
| `src/test/canvas-phase-b.test.tsx` | New Phase B integration, privacy, timing, mapping and fallback tests. |
| `src/test/canvas-engine-scheduler.test.ts` | Updated finite motion-budget boundary. |
| `src/demo/canvasPhaseBFixtureSource.ts` | Test-only real-component/canonical-domain transport fixture; never imported by app routes. |
| `scripts/verify-joker-canvas-phase-b.cjs` | Dealing, nine-card, desktop, ownership/hit/focus and allocation browser checks. |
| `scripts/verify-joker-canvas.cjs` | Existing real-GameTable harness adapted for the intentional hand owner and longer recovery transport. |
| `docs/canvas-phase-b-report.md` | This report. |

## Verification and discovered defects

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js <changed TS/TSX> --rule 'prettier/prettier: off'
node node_modules/vite/bin/vite.js build
node scripts/verify-joker-canvas.cjs <external-playwright-module>
node scripts/verify-joker-canvas-phase-b.cjs <external-playwright-module>
```

- Full regression: **160 files / 1,056 tests passed**, including rules/scoring, bots, authorization/projection safety, Joker, barriers, recovery and existing DURAK tests. Seventeen new Phase B tests.
- Strict TypeScript and production build pass. Scoped lint has no errors; two pre-existing GameTable hook warnings remain. No new runtime dependency.
- Existing real-GameTable/canonical-dispatcher Chromium harness: eight scenarios, three consecutive tricks in each ruleset, 900ms delayed authority, rejection, native Chromium touch, reduced motion, cold fallback, resize/blur/focus/remount and local/shared context failure. Recovery uses 2500ms simulated authority so a deliberately interrupted owner cannot finish before the context-loss assertion under concurrent QA load. Application timing is unchanged.
- Additional real-component/canonical-domain Chromium harness: normal deals in all rulesets, Popular/Minus 3+6 stages, Classic nine-card deal, a forced-DOM counterpart and 1280x720 desktop. Landscape also covers 844x390, 568x320 and resize to 800x370. It verifies actual spatial card drawing, backs-only dealing, exclusive visible ownership, retained piles, exactly one acknowledgement per stage, final face-up hands, hit-center alignment before/after keyboard focus and no page scroll.
- Bugs found and corrected by verification: premature scope replacement at nine-card choice; the 32-motion handoff limit; stale reflow overriding direct drag; hit targets separating from animation; keyboard focus scrolling a clipped hand; a deck-to-trump center offset/preparation gap. The source architecture was corrected rather than weakening those assertions.
- Component fixtures simulate transport and use canonical domain transitions; their keyboard callback is an intent probe. The separate GameTable harness executes canonical gameplay commands and bot plans. Neither is authenticated live Supabase multiplayer.
- Recorded PNGs/WEBMs were inspected. Generated results are in `.test-tmp/canvas-phase-b-results.json`, `.test-tmp/canvas-game-results.json`, screenshot/video folders. Test fixtures are removable and do not ship through app routes.

## Measurements and memory limits

The final dedicated Chromium run records a maximum active-frame gap of approximately **16.8ms** across the measured Canvas rituals. Cumulative synchronous paint time for a reported scene was about 23–41ms for ordinary dealing and about 247–280ms for nine-card sequences. These totals span an entire scene; they are **not per-frame cost or GPU completion time**. They are headless fixture observations, not device performance guarantees or p95 measurements.

Measured backing-store peaks at DPR 1: two Canvas surfaces / 2,633,280 RGBA bytes at 844x390; two / 1,454,080 bytes at 568x320; two / 7,372,800 bytes at 1280x720. The forced-DOM counterpart used zero Canvas surfaces and passed the same acknowledgement/input checks. DOM texture memory/paint was not measured, so this is not proof of a Canvas performance improvement.

Each engine still caps DPR at 2 and backing area near four million pixels. Three simultaneous hand/local/trick surfaces can therefore approach 48MiB of RGBA backing storage on a large screen, excluding decoded images, GPU copies and DOM. The 16-entry bitmap pool is not a bound on total browser memory. Physical Android/iPhone/Safari, GPU memory, long tasks and matched Canvas-vs-DOM device profiling remain unverified.

## Delivery and next work

Review this single Phase B PR before merge. No automatic merge or deployment is authorized. The review PR head and its CI results are the canonical delivery identity; source blobs are checked against locally tested contents.

Next: physical mobile/Safari review, explicit interrupted-ritual checkpoint recovery, profiling/consolidation of scene surfaces, then Phase C Joker trick ownership/interleaving. Secure Supabase Realtime remains a separate reviewed workstream; no JWT, RLS, triggers, migrations or PIN-auth changes are mixed into this PR.
