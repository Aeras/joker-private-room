# JK — Session-first Lobby: implementation sequence

## Confirmed behavior
- Each whitelisted player authenticates with their **existing unique personal PIN**, not a room PIN; no PIN is stored in a browser or app.
- Session persists across browser closure and phone reboot while valid. Expired/revoked sessions require re-authentication.
- Authenticated home displays identity and Create / Join, except when the server confirms any active participation, when only Return is offered.
- Join shows server-authorized **not-yet-started** available rooms (owner, variant, occupied seats). Join requires no room code input; opaque room code may remain internal as a backend locator.
- Exactly one room/game participation per human, enforced transactionally on server, not just by disabled buttons or session storage.
- Once joined, use existing four-seat lobby with human/bot seats; joining user cannot browse rooms until explicit pre-start leave.
- Pre-start non-host Leave atomically releases their seat and returns to available games. **Confirmed host Leave:** atomically cancel the entire unstarted room, release ALL waiting participants, and redirect every waiting participant directly to the authenticated Join / available-rooms list (NOT the main Create/Join home screen). Do not transfer host. Notify clients/realtime and prevent late join/start of cancelled room.
- Host starts: room instantly disappears from joinable list and existing gameplay proceeds.
- Restart/reopen: Return goes to existing lobby if unstarted, and to *current authoritative game projection* if started.
- With other humans, existing 30s timeout and temporary bot ownership preserved. One-human + bots remains paused on disconnect, resumes at frozen authoritative state.

## Implementation gates
1. Reuse existing secure __Host-joker_session on home and creation; no new PIN or public identity bypass. **This PR is phase 1 only.**
2. Extend server-side active membership lookup to include *lobby* membership; validate session server-side and prefer current active game over lobby in inconsistent legacy data.
3. Add private, service-role-only RPC for session-scoped joinable lobby list with minimal public metadata, not secret identifiers or auth tokens. Update room-commands edge and server function.
4. Add atomic pre-start leave and enforce one open participation per player across concurrently created/joined rooms. Keep idempotent command ledger and action IDs. Existing started-game membership must remain supported.
5. Replace /join code/PIN with room discovery; /create consumes authenticated player and no extra PIN. Keep compatibility during rollout.
6. Return button routes by authoritative lifecycle. Optimize critical rendering path, instrument p50/p95 time from tap to first table frame; avoid stale local snapshot or second game controller.
7. Targeted unit/integration concurrency tests: simultaneous join, two tabs/devices, room start versus join, leave versus start, app restart, session expiry, bot pause/reclaim, host cancellation and join-list redirect.

## Critical discoveries from current main
- get_current_active_game_internal currently checks only game_participants, not room_seats in lobby. Current Return always routes /table, thus cannot restore waiting rooms.
- Secure cookie maxAge in authFunctions.ts is 24h. A persistent session beyond 24h requires a server-side renewal/TTL decision; do not fake indefinite authentication or store PIN.
- /join currently verifies identity and requires a typed four-character code.
- /create currently repeats PIN prompt; this PR reuses validated session when possible, but legacy form remains as fallback until new flow is deployed.
- Database create_room_internal currently checks active_game_for_player_internal, which excludes pre-start lobby membership, so race-safe uniqueness must be addressed before enabling public room list.
- Existing room-commands endpoint accepts session token only through trusted server-side cookie proxy; preserve this boundary.
- Host deliberate Exit before starting is CONFIRMED: cancel the room, release all members, and navigate affected clients to the Join / available-rooms list, where they can join another room or navigate back to the Create/Join home. Simply closing the browser/app, rebooting, or losing connectivity MUST NOT cancel the room; the host can resume into the same waiting lobby.

## Release policy
Do not merge phase 1 alone into production just because TS tests pass. Login, lobby discovery, membership protection and return must be validated together before replacing the current user journey. Keep gameplay rules, private deck and bot authority unchanged.
