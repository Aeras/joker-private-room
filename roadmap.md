# Card artwork replacement

- [x] Import the 52 standard cards, 16 backs, and two Jokers unchanged from the specified sources.
- [x] Update card mapping/preload and remove only obsolete card optimization references.
- [x] Verify source bytes, focused tests, and browser decoding without changing game rules (70 source hashes; 91 tests; 39/39 active assets decoded; preview build OK).

# Presentation polish
- [ ] Large fixed-width local hand with count-based overlap and lowered reveal.
- [ ] Larger table cards, edge dealer source, and 420ms deal settle flowing into blocked hand reveal.
- [ ] Instant optimistic local declaration with authoritative rollback/reconciliation.
- [ ] Focused tests, lint, and live visual verification; inspect automatic build results.