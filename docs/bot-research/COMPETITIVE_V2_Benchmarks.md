# Competitive v2: measured release comparison

Policy merged in PR #156, main `68038650f09878d27ff0af42fe1d1c9cf9c332e8`. Targeted CI run 37887513076 passed changed tests, related tests, lint, strict TypeScript and build after full-game integration tests received a dedicated 30s timeout. Each search still has a 150ms ceiling.

Command: `bun scripts/competitive-benchmark.ts 30 750000 popular`.

720 completed real 24-deal games: 30 independent seeds per tested tier, 4 seat rotations, 120 matched baseline/candidate pairs per tier. Only lineup slot 0 changes policy; its three opponents remain frozen baseline. Deck/dealer streams are matched. Approximate normal 95% intervals cluster by seed, not the correlated rotations. No canonical rejection or simulation failure occurred in the completed batch.

| Target tier | Paired score delta (95% CI) | Win-share delta, percentage points (95% CI) | Local decision p50 / p95 / p99, ms |
|---|---|---|---|
| T1 | +766.92 (+679.04, +854.79) | +55.83 (+45.21, +66.45) | 0.62 / 5.87 / 7.87 |
| T2 | +932.25 (+836.83, +1027.67) | +56.67 (+46.72, +66.62) | 1.43 / 15.42 / 20.32 |
| T3 | +1050.83 (+952.63, +1149.03) | +70.00 (+63.19, +76.81) | 2.43 / 29.01 / 39.39 |

These results support improvement against this baseline opponent population in Popular. They do not establish strength against humans, universal tier ordering, calibrated win probabilities or production Edge CPU capacity. Normal-interval approximation and only 30 independent seeds are limitations. Timing was measured locally in Windows/Bun with other verification processes running.

An earlier exploratory batch, `30 740000 popular`, also completed 720 games with positive score/win deltas for all tiers. It predates retained common seeding through the separate Joker-semantic command and is not the release validation. No parameter tuning or failed-run removal was used to select the held-out validation seeds.

Three additional pilots (`2 760000 classic`, `minus`, `panagiotis`) completed 48 games each, all with positive target score/win deltas. Two independent seeds per mode do not establish statistical strength; their confidence intervals are deliberately absent. Panagiotis is the canonical all-bot path, without a human reserved target. Release aggregate JSON and all three pilot aggregate JSON files are retained in `benchmarks/`. The CLI aborts rather than silently discarding a rejected canonical command.

The JSON tier aggregates combine same-profile baseline seats with the upgraded target where a profile appears twice. They must not be mistaken for target-only performance. The paired-score and win-share deltas above explicitly select rotated lineup slot 0 and are the appropriate comparison.

The separate resumable-runner increment serializes canonical state and RNG position between bounded chunks. It preserves identical full-game results through JSON checkpoint/recovery and does not change live multiplayer state or animation timing. It is a prerequisite for the durable Bot Lab, not a claim that the Lab backend is already deployed.
