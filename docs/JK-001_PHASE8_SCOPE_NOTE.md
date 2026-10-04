# JK-001 Phase 8 Scope Note

Phase 8 implements the canonical semantic gameplay command dispatcher and the complete bot decision contract.

Production Start-to-canonical-state bootstrap is deliberately not implemented in this phase because the authoritative handoffs define cyclic first-Ace dealer selection but do not specify which seat receives the first card of that separate selection procedure. The existing Phase 3 primitive therefore requires `firstRecipientSeat` explicitly rather than inventing a seating convention.

No default seat is inferred. This must be resolved by an authoritative product/game-rule decision before production initialization is wired.

This note does not reopen any confirmed dealer, deal, declaration, trump, Joker, scoring, timeout, reclaim, or bot fairness rule.
