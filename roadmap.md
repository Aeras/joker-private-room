# Card artwork replacement

- [x] Import the 52 standard cards, 16 backs, and two Jokers unchanged from the specified sources.
- [x] Update card mapping/preload and remove only obsolete card optimization references.
- [x] Verify source bytes, focused tests, and browser decoding without changing game rules (70 source hashes; 91 tests; 39/39 active assets decoded; preview build OK).

# Presentation polish
- [x] Large fixed-width local hand with count-based overlap and lowered reveal.
- [x] Larger table cards, edge dealer source, and 420ms deal settle flowing into blocked hand reveal.
- [x] Instant optimistic local declaration with authoritative rollback/reconciliation.
- [x] Focused verification: 99 tests / 12 suites; lint 0 errors, 2 existing warnings; isolated desktop/phone visual checks; automatic build OK. Authenticated external-backend gameplay, standalone TypeScript, and production build not independently verified.