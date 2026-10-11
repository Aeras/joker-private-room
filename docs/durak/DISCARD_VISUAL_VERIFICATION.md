# DURAK discard collection verification

## Rendering failure and fix

The previous effect transformed live pair containers inside an overflow-clipped field and a size-contained center. Those nodes were also replaced when the presentation timer advanced. A successful CSS animation therefore did not prove that the cards visibly reached the pile.

The new layer measures individual played-card rectangles and the real pile mound in a layout effect. It snapshots the existing artwork and portals independent flying cards directly into the fullscreen root. Original card nodes can unmount without cancelling the snapshot animation. Every card stays opaque, flips in a nested transform, follows measured keyframes, and lands at the same deterministic irregular coordinates used by the persistent mound. The normal sequence lasts 680–760 ms; reduced motion uses 120 ms. Completion comes from actual animation promises, with a bounded safety fallback.

The server records an explicit public `discard` or `take` event on official bout closure, including closure by a non-card command. Collection requires the exact authoritative discard delta to match the public completed pairs. Each landing advances the displayed count; the next queued bout waits for the collection to complete. Reconnect/history gaps restore the actual count without replay. Version negotiation filters new resolution events from old open clients without changing stored history. No rules, hidden hands, deck order, ownership or JOKER code changed.

## Browser evidence, 2026-10-11

Chromium rendered the actual DURAK route, table, artwork, hook and collection components. An isolated offline service fixture ran accepted moves through the canonical engine and the actual server event recorder. No real rooms or player statistics were modified. The fixture returned several completed bouts together, and repeated polling while animations ran.

The sequence comprised two defended pairs (4 discarded cards), three defended pairs (10 total), one defended pair (12 total), then a take (still 12). Frame samples verified visible opaque flying elements, intermediate pile counts, all three collections, unchanged count after taking, and no viewport overflow. Screenshots and a recorded video were visually inspected, including the flip/flight and final mound.

| Viewport | Seats | Motion | Result |
| --- | --- | --- | --- |
| 844 × 390 | 4 | Full | Pass: three successive collections, 4 → 10 → 12 |
| 568 × 320 | 4 | Full | Pass: flight stays inside short landscape viewport |
| 1280 × 591 | 6 | Full | Pass: heap clear of opponents and controls |
| 844 × 390 | 2 | Reduced | Pass: same authoritative progression |

Unit coverage additionally exercises collection survival after original DOM removal, poll rerenders, deduplicated callbacks, unmount cancellation, reconnect, resolved takes, mismatched discard deltas, legacy event filtering and capped heap rendering with an accurate total count. Both DURAK variants and existing JOKER tests are included in the full regression suite.

Browser evidence uses a canonical offline fixture, not an authenticated production match. Real-device GPU behavior remains a live playtest consideration.
