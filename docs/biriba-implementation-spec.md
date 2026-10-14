# BIRIBA — authoritative implementation decisions (October 2026)

This file records the user's confirmed custom variant. It is not an endorsement of an external ruleset. All code must stay isolated from JOKER and DURAK. Do not enable the existing game-selection tile until an actual authenticated, server-authoritative multiplayer room can be created and resumed.

## Gameplay
- 2 seats individual or 4 seats, fixed opposite partners (0+2 vs 1+3). 108 physical cards: two standard 52-card decks plus four Jokers. Deal 11 to each, reserve two independent 11-card packets. Dealer's left neighbor cuts and prepares packets.
- Players may draw one face-down card OR pick up the entire discard pile, but picking up requires using at least one card from anywhere in that pile in a valid new meld or existing legal meld during the same turn. Top discard need not be the used card. Discard a card to end ordinary turns.
- Melds are ascending consecutive cards of exactly one suit, at least three cards. No same-rank groups. Ace can be low (A-2-3) or high (Q-K-A) but no wrap (K-A-2).
- One ACTIVE wildcard (Joker or 2 acting as a different card) per meld. A same-suit 2 in its natural position is never an active wildcard and may coexist with a Joker or off-suit 2. Once naturalized, the same-suit 2 stays as rank 2 for the rest of the meld. Joker is always dirty. When a natural replacement arrives, the wildcard may only shift within that same run to an otherwise legal endpoint; it never re-enters a hand or moves to another meld.
- Meld >=7 is biriba; full 13-value meld is 'χιλιάρα'. Scores use final meld state only, never cumulative stage bonuses. Trump suit is that of initial open card, including a 2. If initial open card is Joker, the first player to LEGALLY use that Joker from discards in a meld establishes trump from the meld suit; if no one does before stock expiry, round has no trump.
- Packet eligibility requires a prior biriba by team. Emptying by meld gives immediate packet and continued turn; emptying by discard gives packet but wait next turn. With empty hand and no qualifying biriba, draw one stock card and MUST discard it, cannot meld. When a teammate creates biriba later, empty-handed player takes packet only on own next turn. One packet per team or one per solo player.
- In 4-player games players must each first play a personal three-or-more-card meld once before adding cards to partner's meld. Unlock persists for round and may be followed by adding to partner in same turn. Both players' melds and scoring remain team-shared.
- Close ONLY after packet received and played, at least two team biribas incl one clean, and the last card discarded. Close +100. If stock becomes empty via draw, current player completes their turn, then round ends without a closing bonus; do not keep playing from discards.
- A teammate always appears across the table in each local player's viewpoint, self always bottom open hand, opponents left/right mirrored for opposite teammate.

## Scoring
Card values: Joker 25, rank2 20, Ace15, 8/9/10/J/Q/K 10, 3-7 5.
Final meld bonuses: clean 7–12 +300, dirty 7–12 +100, clean trump 7–12 +600, dirty trump +300; 13 clean +1000, dirty +500, 13 trump clean +2000, dirty +1000.
Closed +100. Leftover cards subtract their values, except a packet received but NEVER played costs flat -100 and its 11 cards are not also subtracted.
Opponent finishes: no packet and no biriba, but team has opened at least one meld => -100; no packet, no biriba and NO player opened any meld => -200; these special penalties are mutually exclusive. Team with >=1 biriba but no packet => base -100. Do not double-charge the packet penalty on the -100/-200 special cases.
Target selectable 1000, 2000, 5000 (default), 10000, fixed for entire match. Check after scoring each deal; highest score at/above target wins; equal score => another deal.

## Lobby and UI
- Use existing persistent player login, player names, avatars and named bot roster. Separate Biriba rooms, tables, turn authority, bot algorithms and score data from other games. Respect one active game per real account ACROSS all supported games.
- Authenticated game-selection screen has Biriba tile; creation chooses 2/4 and target, joining lists open rooms. Host can add named bots or start to autofill empty seats with bots, with difficulty ★/★★/★★★. Bots are fair (no opponent hand peeking), quick to decide, cooperative within assigned team, animations same for bots and humans.
- Adopt the user-approved generated table concept as precise FIRST-PASS arrangement, not general inspiration: existing felt/wood table shell, top partner, left/right opponents, own open card fan rising from lower edge, red meld zone upper left, blue zone upper right, matching score plaques; center draw/discard/two packets/trump. Team color assignment randomized at game start and consistent across all clients, either team may be red/blue. On two-player game same color distinction per player.
- Each team zone shows live team score. Small top-right icon opens per-deal and per-human points/penalty breakdown and cumulative team score. Scale layout to desktop/mobile; preserve table zones and card legibility.
- PixiJS rendering and quick smooth animated movement for all face/back cards, meld transitions, packet pickup and discards. Gameplay authoritative state must be independent of PixiJS. Human selects multiple cards by taps (rise slightly), uses 'Κατέβασμα', taps destination meld to add, and drags card to discard.
- 60-second human turn clock. On timeout a random 1–3★ bot takes over the human seat until manually reclaimed; no user loses ownership. Each HUMAN has up to THREE pauses per entire match, only while own turn is current; self-avatar toggles pause/resume. Pause lasts indefinitely, stops entire authoritative game for everybody and preserves remaining time; server records per-player count, prevents fourth pause. Bots cannot pause. No interruption of active match from background-tab throttling.

## Delivery constraints
- Ship in independent, reviewed stages; no direct alterations to existing JOKER or DURAK engine paths.
- Never claim online game playable merely because a Pixi preview works.
- Tests must cover authorization, hidden information, team composition, packet transitions, discard requirements, timer, pause, game end, multi-device synchronization and reconnection.
