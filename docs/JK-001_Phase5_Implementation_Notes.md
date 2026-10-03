# JK-001 Phase 5 — Player-Specific Projection + Hidden Information

Scope of this phase:

- add the single canonical `projectGameForSeat(canonicalState, seat)` projection;
- construct a fresh player payload instead of copying canonical state;
- expose public game state plus only authorized local private state;
- derive card-play choices through the canonical legal-move engine;
- expose nine-card first-three cards only to the authenticated chooser;
- fail closed if hidden-partial visibility state is inconsistent;
- derive viewer seat from the authenticated game participant, never browser input;
- add a browser-callable server function that returns only projected state;
- add negative serialized-payload tests for opponent hands, hidden own partial hands, deck/order and future cards.

This phase does not implement timeout takeover, bot strategy/progression, reclaim mutation semantics, finalization/history, or production gameplay UI wiring.
