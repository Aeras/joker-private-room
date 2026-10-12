# Phase C: resolved Joker Canvas presentation

Base: GitHub main b41fe8c8c9d8de17375a8f58451259f0b7899392, including #244–246. Source identical to #246 head; no production changes.

## Implementation and ownership

Existing server semantics are LEAD/HIGHER_SUIT, LEAD/SUIT_WINS, OPEN_TRICK/COMPETE and OPEN_TRICK/FROM_BELOW. HIGH/LOW are descriptive names, not new canonical modes. No rules, bot strategy, commands, scoring or databases changed.

Local resolved Joker flights now use the existing CanvasLocalFlight adapter and prepared face/back bitmaps. An unresolved Joker cannot launch. The unchanged hand input and chooser portal keep the Joker stationary until a legal choice, and submission remains the existing authorized command path. Animation completion never submits or accepts a command. Acceptance may arrive before/after landing; rejection reverses from the current pose, including its flip. Context loss restores a DOM surface at the current position/flip with once-only callbacks.

TrickPresentation no longer switches a mixed trick back to DOM merely because a Joker appears. Public resolved Jokers use the same journal, preparation gate and single CanvasTrickScene as ordinary cards. FROM_BELOW uses a 300ms cosine flip inside the 450ms flight; per-pose layer changes at the halfway flip point. It lands at the regular card slot, below other cards, retains its back throughout hold/stack/collection, and supports a short reduced-motion crossfade. Two different Joker identities remain independent sprites in public play order. Hydration is settled, without historical replay. Cold/null/lost contexts retain the existing DOM fallback.

CardCanvasEngine accepts an optional finite per-pose layer. No new rendering library or continuous idle RAF. Existing durations and acknowledgement barriers remain. Normal and competing Jokers use ordinary flight geometry.

## Remaining DOM

Chooser portal, invisible accessible hand hit targets, avatars, chat, scoreboard, menus and fallback card surfaces remain DOM intentionally. Static opponent card backs and the settled trump stack also remain DOM: converting them independently would introduce additional backing surfaces and geometry/focus ownership before a unified static-scene measurement contract exists. Their migration is a separate remaining task, not claimed complete here. Suit-only/no-trump indicators remain UI.

## Validation

Full unit suite, TypeScript, production build, focused changed-source semantic lint and actual Chromium landscape scenarios were executed; exact final counts/status are in the PR. Browser harness uses actual GameTable/artwork/Canvas with simulated transport and canonical command validation. Twelve Joker scenarios cover all four choices across Popular, Classic and Minus, keyboard activation and native touch choice. All show stationary choice, one local owner awaiting delayed authority, mixed public bot play, hold, stack, collection and no DOM duplicates. Existing Phase A eight scenarios and Phase B eight scenarios were rerun, including cold fallback, rejection, interruption, resize, real touch, dealing and nine-card transitions.

Focused regressions include two-Joker batched ordering across rulesets, FROM_BELOW flip duration/layer/endpoint/back retention, reduced motion, local authority delay/rejection, context fallback and once-only callback delivery. Existing touch/dismissal/server-rule tests remain.

Recording: local .test-tmp/phase-c-video (FROM_BELOW fixture). A sampled recorded frame was visually inspected: the Joker back occupies its regular bottom trick slot, behind the side card, with the original assets/layout.

## Limits and follow-up

These are Chromium fixture measurements, not authenticated multiplayer, physical Android, iPhone/Safari or GPU/memory benchmarks. No production latency improvement claimed. Existing engine diagnostics measure cumulative paint/frame gaps; static DOM-to-Canvas migration needs a measured shared scene, not three extra canvases. Verify weaker-device flip/backface behavior and touch/landscape interruption before release. Remote context fallback preserves ownership but may replay the remainder using the old DOM timing. Full repository lint includes pre-existing formatting/hooks issues; unrelated formatting was not rewritten.

Changed modules: LocalFlightCard, UnderJokerFace, TrickPresentation; canvas/CanvasLocalFlight, CanvasTrickScene, engine, types, projectionAdapter, trickSceneMotion, jokerMotion; four existing Canvas regression files; demo/canvasBrowserFixtureSource; scripts/verify-joker-canvas-phase-c.cjs. No DURAK edits.
