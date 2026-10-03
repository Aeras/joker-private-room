# JK-001 Phase 4 — Canonical Game State + Atomic CAS

Scope of this phase:

- add the server-only CanonicalGameState TypeScript model;
- persist canonical_state on public.games;
- add private.game_command_ledger;
- add service-role-only load/persist RPCs;
- enforce expected state version and idempotency fingerprint inside one Postgres function transaction;
- keep game-rule transitions in TypeScript, not SQL;
- keep raw canonical state behind a server-only helper;
- explicitly defer player-specific projection/serialization to the next phase;
- explicitly reject generic lifecycle=complete persistence until atomic finalization/history is implemented.

This phase does not wire browser gameplay, timeout/reclaim, bots, finalization/history, or player-facing state projection.
