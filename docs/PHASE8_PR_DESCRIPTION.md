# JK-001 Phase 8 — Gameplay Dispatcher

Implements the canonical semantic gameplay command dispatcher and the complete bot decision contract for declaration, 9-card trump choice, card play, Joker-led semantics and Joker-in-trick compete/from-below. Human commands derive the seat from authenticated game state, resolve overdue timeout first, and persist through the existing CAS primitive. Bot progression now proposes concrete semantic gameplay commands from a fair seat projection.

No Tier 1/2/3 strategy intelligence, automatic persisted bot progression, finalization/history, production table UI, AI Banter/Gemini, migration or Edge deploy is included.

Production Start-to-state bootstrap is intentionally deferred because the authoritative handoffs do not specify which seat receives the first card of the separate first-Ace dealer-selection procedure. No default was invented.
