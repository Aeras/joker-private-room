# JK-001 Phase 6 — Timeout / Temporary Bot Control / Reclaim

Scope of this phase:

- enforce the confirmed 30-second human turn deadline from server time;
- resolve overdue timeout before projected reads/reconnect responses;
- timeout changes controller only, never seat owner/hand/score/history identity;
- expose immediate authenticated reclaim through the existing atomic CAS primitive;
- derive reclaim seat from the authenticated viewer seat, never browser input;
- preserve already committed actions through normal version/CAS ordering;
- provide a hard-bounded synchronous bot progression framework;
- give bots only `projectGameForSeat(...)` fair information and canonical legal actions;
- require the future canonical gameplay command dispatcher as the only mutation adapter for bot actions.

This phase does not duplicate gameplay rules, implement finalization/history/stats, or wire the production gameplay table.
