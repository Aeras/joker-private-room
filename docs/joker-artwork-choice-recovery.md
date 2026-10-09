# Joker choice and card artwork recovery

Base: GitHub main `b97cd4a921186bf431c6354559a18e3130bb6ec0` (#178).

## Changes

- Open-trick chooser: FROM_BELOW on the left, red COMPETE on the right.
- A human's chosen Joker mounts its flight and removes the chooser before command transport executes. Acceptance still runs in parallel and never relaunches the card. Duplicate-submit locking and rejected-return behavior remain.
- Competitive bots send the already evaluated Joker semantic in the same `play_card` command. The existing canonical validator validates both parts and persists one version. Budget/error fallback also carries a legal semantic. Legacy pending-Joker commands remain supported; the historical baseline stays unchanged for benchmark comparisons. Temporary bots cannot display a human choice panel.
- Background artwork warm-up uses two workers instead of 39 simultaneous transfer/decode requests. Visible critical cards bypass that background queue and coalesce matching requests.
- Transfers have a 12-second bound instead of 2.5 seconds. Decode has its own 2.5-second bound. A loaded, valid image whose decode rejects or stalls is marked renderable-ready, separately from decoded-ready. Actual image `load` can restore artwork; preload completion cannot overwrite a successful DOM load.
- Failed transfers try the original PNG and do not poison the cache forever. Mounted artwork has two delayed recovery attempts; a real online event permits another attempt. Genuine unavailable images retain a semantic fallback and presentation cannot wait indefinitely.
- New optimized PNGs preserve all original PNG/SVG files, names, dimensions and RGBA pixels. No WebP compatibility dependency, resolution reduction or lossy card artwork. Optimized-path errors fall back to originals.
- Timing export now describes both 500 ms automatic-actor polling and 1500 ms ordinary polling, plus the immediate refresh kick.

## Measurements

55 PNG files: 2,409,616 → 2,278,915 bytes, saving 130,701 bytes (5.42%).
`scripts/optimize-card-pngs.py` reproduces the derivatives. `docs/card-png-derivatives.json` records byte sizes, dimensions and SHA256 hashes. An independent Node PNG decoder in `card-png-derivatives.test.ts` compares all original/derivative RGBA pixels and verifies every gameplay registry target. Identical pixels/dimensions preserve the artwork at DPR 1/2/3; actual device rendering and motion still require browser testing.

The byte saving is modest. The larger reliability change is reducing simultaneous decode pressure and recovering from transient failures. Decoded texture memory per card remains proportional to the unchanged dimensions. No claim is made that this guarantees every device or fixes a measured GPU bottleneck.

## Verification and limits

Full regression passed: 102 files / 681 tests before the final additional online-recovery and third Joker-choice scenario checks. Final targeted rerun and CI are recorded in the delivery report. Strict TypeScript and production build passed. Affected lint has no errors; two existing dealer-effect dependency warnings remain.

Behavioral checks cover all human Joker contexts, an unresolved command response, instant chooser removal/flight ownership at transport invocation, server rejection, atomic bot Joker state versions, temporary control, delayed decode/load, optimized-to-original fallback, bounded failure, cache cooldown and pixel equivalence.

Local browser verification was attempted. Edge closed during startup with Windows access error `80070005`; Chrome was unavailable in the sandbox. Real Android cold/warm cache, memory-constrained rendering, and the final look of Joker transitions remain acceptance tests.

No dealing, reveal, card-flight, FROM_BELOW flip/travel, trick hold/stack/collection timing, sound, scoring, rules, avatars or geometry constants changed. No schema migration is required. No frontend publish or production deployment is part of this patch.

The scheduled game-reconciler bundles bot strategy code. Its existing live bundle must eventually be updated to this verified commit to make scheduled bot turns atomic too. Frontend/server publishing updates its own code path, but does not automatically redeploy a Supabase worker. Do not claim all live workers are updated without checking that deployment separately.

## Study recommendations intentionally deferred

No wholesale presentation rewrite, canonical snapshot buffering, artificial Joker confirmation delay, altered collection path, additional human-input pause, blanket memoization, or unmeasured timing tuning. The existing journal, monotonic admission, barriers and completion ownership remain. Optional winner-avatar glow, new badges, haptics and scoreboard animation are polish, not prerequisites for the reported failures.
