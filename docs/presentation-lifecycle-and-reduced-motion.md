# Presentation lifecycle and reduced motion

Base: GitHub main `6336f8c` (including PR #182 local landing ownership). This change is client presentation only; no migrations, Edge deployments, scheduler, game rules or scoring changes.

## Single timing source

`src/components/table/presentationTiming.ts` owns the client flight, landing, inter-play readability beat, trick hold/stack/collection, Joker flip, dealer/deal, trump placement and hand durations. Existing module exports remain compatible. CSS inline durations and fallback completions consume the same constants. Server deadlines and bot computation remain independently server-owned; the inter-play beat applies to visible remote/human/bot sequencing, not bot strategy.

Normal timings are preserved: local flight 300 ms, remote landing 340 ms, readability beat 160 ms, trick hold 550 ms, stack 250 ms, collection 380 ms, FROM_BELOW flip 300 ms/travel 450 ms, deal handoff and hand entrance 600 ms each. This task does not retune pacing.

## Cancellation ownership

`PresentationRun` guards callbacks using an owner-local generation. Invalidating a run rejects callbacks that were already queued even when clearing their browser timer would be too late. `presentationTimeout` invalidates on effect cleanup. Dealer/deal owners guard preparation frames, card timers, completion and the continuation after trump placement. Trick surfaces scope completions to their stage/resume generation, and parent landing delivery checks authoritative journal identity. Local flight identity includes game/deal/seat/card/source version, preventing a new game from inheriting an old mount. Existing ordered journal and geometry snapshots are preserved.

Strict Mode cleanup previously cleared deal timers without resetting the running/stage refs. The effect replay then believed the cancelled run was still active. Cleanup now clears those refs for an unfinished stage, allowing a valid restart; completed markers remain idempotent. No cancelled run is acknowledged as complete.

Tokens protect asynchronous callbacks; they are not a second canonical game engine or a replacement for server CAS.

## Reduced motion

Uses the device/browser `prefers-reduced-motion` preference, with change subscription and listener cleanup. No new game setting or device-specific coordinates.

- Dealer/dealt cards fade into their final target with at most 12 px of entry movement.
- Local cards use a short fade near their canonical target, still awaiting authority and retaining rejection recovery.
- Remote cards enter near the destination; collection fades in place instead of a long exit or pinned rotation.
- Under-Joker and trump faces crossfade instead of a 3D flip. Trump placement retains the existing stage/completion protocol.
- Local hand entrance fades near the final hand lane; reflow does not animate under reduced motion.

Deal order, cadence, readiness/barrier durations and completion acknowledgements are unchanged. Existing reduced trick timings remain; no new canonical progression behavior is introduced. Local/dealer/deal/trump cards freeze the preference for their mounted motion to avoid relaunching on a settings change. Normal motion is unchanged.

## Verification and acceptance

New behavioral tests deliberately invoke cancelled queued callbacks, switch games during dealer/deal preparation, verify Strict Mode completion once, ensure reduced flight still waits for authority, retain all four trick cards through collection, check hand/trump fades and preference listener cleanup. Historical timing source-string assertions are changed to assert actual exported values after centralization.

Real Android/browser acceptance is still required for perceived fades, Joker layering, resize/fullscreen and normal motion parity. JSDOM tests do not measure CSS interpolation or GPU frame smoothness. Frontend Publish remains with the user.

Local verification: 104 test files / 693 tests passed, including 10 new lifecycle/reduced-motion tests; strict TypeScript and production build passed. Affected-scope ESLint passed with the repository's CI rule disabling historical Prettier style errors; one existing `active` dependency warning remains in the local landing hydration effect. CI must also pass before merge.
