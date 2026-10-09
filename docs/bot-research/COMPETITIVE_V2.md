# Competitive v2 implementation

The frozen `baselineRuntime.ts` and unchanged `strategy.ts` retain the pre-upgrade policies for matched comparisons. Existing catalog profile IDs continue to identify tier and character; `strategyVersion: competitive-v2` separately identifies the decision algorithm in automatic command records and action IDs.

The new policy accepts only `PlayerGameProjection`, uses the existing public observation and hard-constrained sampler, and evaluates complete card/Joker actions over common hypothetical worlds. Every completed hypothetical trick uses canonical `resolveTrick`; declaration restrictions, deal scoring, complete-round premia and final ranking use their canonical functions. At partial nine-card trump choice, future six-card allocations come from hypothetical stock, never actual deck order. The separate Joker-semantic command retains the same public seed and card meaning.

Rollout actors receive only their own hypothetical hand and public trick/bid/count, not another actor's hypothetical hand or stock. Root candidates share world samples; partial candidate batches are discarded on budget exhaustion. Three opponent-policy scenarios model trick seeking, exact protection and conservative exits. These are approximate opponent policies, not opponent knowledge. The revisable deal plan is derived from each public state, including exact/overshot/unreachable intentions and threatened seats; it is not a hidden persistent strategy engine.

Tier 1/2/3 sample 6/16/32 worlds, with 18,000/42,000/90,000 transition caps; Tier 3 doubles worlds in small endgames. Search also has a 150ms ceiling and legal frozen-policy fallback. Larger budgets improve estimation, but do not by themselves prove an ordering of competitive strength between tiers.

Current-deal scoring and premia at round closure are exact. Earlier round-completion qualification uses a deliberately neutral seeded model. Early-game standings utility is a rank-margin surrogate, not a calibrated probability of final victory. This first policy does not claim IS-MCTS, an exhaustive imperfect-information equilibrium, learned opponent posteriors or calibrated multi-deal forecasts. Future benchmark-driven improvements should be separately versioned.

`scripts/competitive-benchmark.ts` replaces only lineup slot 0 and compares it against three unchanged baseline opponents on matched seeds, all four seat rotations and matched dealer/deck streams. Confidence intervals cluster by independent seed, not rotation. Strength claims must use completed runs and name the tested ruleset/opponent population. The result JSON preserves all aggregate outcomes, including failures (a canonical rejection aborts the run rather than being discarded).

Verification includes real 24-deal games on all four rulesets, deterministic repeat games, mandatory-highest legality, exact preservation exits, separate Joker semantics, canonical scoring/premia oracle, wall/step cancellation fallback, and a hidden-truth metamorphic test that swaps actual opponent hands and reverses actual hidden stock before projection.

No presentation, pacing, audio, avatar, dealing or multiplayer rules were changed. No production deployment or database migration is part of this policy phase.
