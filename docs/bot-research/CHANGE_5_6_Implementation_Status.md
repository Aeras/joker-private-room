# Changes 5 and 6 — verified implementation increments

## Current delivery status — 9 October 2026

The Phase 1/2 sections below are historical snapshots from PRs #154/#155. Their then-open items are superseded by these increments:

- PR #156 enabled competitive-v2 for permanent and temporary Tier 1/2/3 bots. Public observations and legal-world sampling drive bounded joint card/Joker, declaration and trump evaluation using canonical scoring/premia. Frozen baseline remains available only for comparison/fallback. See COMPETITIVE_V2.md for exact capabilities and approximations.
- PR #157 added serialized canonical-engine checkpoints/RNG recovery and release benchmark evidence. Held-out Popular validation completed 720 games with positive target score/win-share deltas and seed-clustered intervals for every tier; pilots cover the other three rulesets. See COMPETITIVE_V2_Benchmarks.md and retained aggregate JSON. This does not establish strength against humans or universal tier ordering.
- PR #158 merged the durable admin-only backend, migration, Edge boundaries, actual statistics, lease fencing, cancellation and recovery. Main at that merge: `0db0aa70544ce637efd3d12efccc16c14305bbb8`. All CI including Full Regression passed (37890657049); PostgreSQL/Deno CI 37890656851. A scoped full-game-test timeout and two obsolete source-string guards were corrected without altering runtime search limits.
- The final interface increment adds the server-authorized home entry and guarded `/bot-lab` route, real job configuration/history/progress/cancellation, results/comparison/latency intervals and bounded synthetic decision inspection. Nine UI behavioral tests cover access, stale poll fencing and non-fabricated progress. Its CI also repeats 10 real worker/database games and 20 matched-comparison games, including full JSONB checkpoint recovery.

**Production activation remains pending:** migration `20261009051533_joker_admin_bot_lab.sql` has not been applied to production, neither Lab Edge Function has been deployed, and the scheduler switch remains disabled. No Publish or production deployment was performed. Follow BOT_LAB_Operations.md on the external owner-controlled JOKER project only.

Local browser visual verification was attempted: Chrome was unavailable to the browser tool, and the in-app browser timed out reaching the local Windows server. Mobile/desktop visual acceptance, real pg_net/cron delivery, browser-close continuation, revoked-session acceptance, production Edge CPU/cost and 5,000-game load acceptance remain required. Automated tests/build do not replace those checks. Animations, audio, avatars, table layout, rules and live multiplayer timing remain unchanged.

## Historical implementation log

## Phase 1: canonical headless benchmark foundation

Base: `ed5085985d4ec5ef8314054a15e7893533ed96e7`. The three mandatory research/design documents were read before this phase. Changes 1–4 remain untouched.

This increment implements a real full-game runner, not the administrator laboratory or the new strategy. It directly invokes the canonical dealer bootstrap, gameplay command dispatcher, lifecycle settlement, ruleset scoring and premia. Synthetic simulation identities never enter the database, live room/game tables, statistics or Realtime streams. No live-game state or presentation delay is altered.

The runner has independent seeded streams for dealer selection, the first gameplay deck and subsequent decks. Each four-game group uses the same deck seed and lineup, rotating the lineup through all physical seats. Opponent policies receive only their own `PlayerGameProjection`. Cancellation is checked between canonical transitions, and a 5,000-transition ceiling terminates faulty runs. Illegal commands fail through the real dispatcher instead of producing invented results.

### Actual baseline measurement

Command: `bun scripts/bot-benchmark.ts 100 20261009 popular`.

- Existing strategies from the base main; **no strategic improvement claim**.
- 100 completed full games, 25 independent seeds, all four lineup rotations per seed.
- 24 deals per game, using canonical scoring and round premia.
- Runtime: 49,234.96 ms on this local Windows/Bun run. This is not a production-worker capacity estimate.
- No simulation rejection/error occurred in this successful batch. The CLI aborts on a failure; failed starts are not included in its successful-game aggregates.

| Existing tier profile | Participations | Outright wins | Tied wins | Mean score | Median | Decision p50 / p95 / p99 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| strong-basic-v1 | 148 | 41 | 0 | 725.74 | 790 | 0.0009 / 1.4826 / 2.2943 |
| memory-inference-v1 | 144 | 38 | 1 | 777.71 | 815 | 0.0132 / 5.0581 / 7.1153 |
| probability-simulation-v1 | 108 | 20 | 1 | 731.30 | 715 | 0.0426 / 14.5400 / 19.9438 |

Random mixes create unequal tier participation; these numbers do not establish a tier-strength ordering. The comparator matches seed, ruleset, lineup, rotation and dealer and clusters deltas by seed. It deliberately omits a confidence interval for fewer than 30 independent seeds. Matched candidate-versus-baseline comparisons have not yet been run.

Metrics include exact/under/over-bid counts by hand size, negative-score penalties, committed Joker modes and their authoritative trick outcomes, actual premia transfers and latency quantiles. Raw results and decision records are generated in `.test-tmp/`; they are local artifacts, not live-game logs.

### Verification

- 11 new behavioral tests; all four rulesets complete their entire schedules.
- Existing three full-game simulation tests also pass: 14 tests total.
- Every completed deal score is cross-checked against its canonical ruleset scorer. Final totals equal all deal scores plus canonical premia adjustments.
- Deterministic decisions/results, four-seat rotation, cancellation, illegal-command rejection, seat-safe projection on every decision, aggregate denominators and matched-comparison input validation are covered.
- Changed-file ESLint, strict TypeScript and production build passed locally.

### Explicit limitations / next increments

1. No advanced policy is enabled by this increment. Public observations, legal constraint sampling, score/premia-aware joint card/Joker search, opponent models, plans and bounded endgames still require implementation and matched benchmarking.
2. This is an operator CLI, not a durable browser job service. There is no Bot Lab route, admin entry point, job schema, lease/recovery worker or cancellation RPC yet. Do not advertise Change 6 as available.
3. Panagiotis simulations use the existing canonical all-bot path: no human reserved target exists. Testing its human-target distribution needs a separate canonical fixture; no target or rule was invented.
4. The runner currently supports the existing baseline strategy only; the strategy-version label must not be treated as a selector for an unimplemented historical policy.
5. A 10-game CLI pilot has two incomplete rotations in its last group, explicitly reported. Balanced comparison batches should use 100/1,000/5,000 or explicit complete four-game groups.
6. Cancellation is cooperative within one process. Durable cancellation/recovery and failed-start accounting must be added at the job layer.

No migrations, database writes or deployments were performed in this increment. The external JOKER project was verified by read-only discovery; the administrator's existing player UUID was identified for the later authorization phase. Display names must never authorize the Lab.

## Phase 2: public observations and legal hypothetical holdings

Phase 1 merged as PR #154, main `e36b95b13483bcc19f4af29ad10416c7933297d4`, with successful Targeted PR Verification run 37884683020.

`src/bots/observation.ts` adds a deliberately separate, projection-only observation contract containing own cards, public plays, public score/premia history, round progression, bid intentions, remaining hand sizes, unknown inventory and hard holding constraints. It does not accept canonical state. It normalizes a pending Joker separately without inventing its semantic choice. It distinguishes three-card trump choice from full nine-card hands.

Normal off-suit responses establish a requested-suit void and, when applicable, a trump void. A normal HIGHER_SUIT response establishes a maximum remaining rank for that requested suit. Voluntary Jokers establish neither fact. SUIT_WINS does not create a highest-rank constraint. Facts use only current-deal history; cross-deal presentation tails and the independent dealer-selection deck are ignored.

The sampler shuffles the entire unknown inventory and rejects allocations that violate hard public facts. Accepted allocations are uniform conditional on those hard facts; excess unknown cards explicitly remain stock. It has a 128-attempt default / 512-attempt maximum and returns null on exhaustion, without greedy repairs or weakening facts. Strong constraints can have a low acceptance rate; rollout policies must track this and retain a legal fallback. This foundation does not yet supply declaration-based soft likelihoods or endgame search.

Ten additional behavioral tests cover forced highest, trump fallback, voluntary/competing Jokers, SUIT_WINS, duplicate/inconsistent inventory, unknown second Joker, reproducibility, impossible-world exhaustion, public score copies, partial nines, pending semantics and every active decision across four full-ruleset simulations. Combined targeted verification: 24 passing tests, changed-file lint, strict TypeScript and production build.

These modules are not enabled in the production decision path yet. No claim of stronger play follows from observation/sampler correctness alone. Advanced strategic policies, matched benchmark tuning and the secure durable admin laboratory remain open.
