# Card artwork replacement

- [x] Import the 52 standard cards, 16 backs, and two Jokers unchanged from the specified sources.
- [x] Update card mapping/preload and remove only obsolete card optimization references.
- [x] Verify source bytes, focused tests, and browser decoding without changing game rules (70 source hashes; 91 tests; 39/39 active assets decoded; preview build OK).

# JOKER played-card smoothness

- [x] Diagnose and correct played-card motion discontinuities without changing timing, authority, or Joker gestures.
- [x] Run focused motion/Joker regressions and inspect real browser motion (106 tests; browser endpoint and repeated-poll continuity; automatic build OK). Physical-phone/full multiplayer checks remain unverified.