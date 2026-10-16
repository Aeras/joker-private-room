# BIRIBA Black Box — operational guide

## Scope and access

This is a disposable **Biriba-only** diagnostics subsystem. It does not edit game rules,
Joker or Durak state, or existing player credentials.

- Every human browser in a Biriba match runs its own lightweight recorder.
  This includes a single human playing against bots and games where the admin
  is not present. Public bot actions observed by the client are recorded with
  the actor seat and action sequence; bot-private hands are NEVER exported.
- The admin dashboard is at `/biriba-debug`, linked in the Biriba UI only
  after a verified session reports administrator status.
- The database checks the actual Joker session for **player UUID**
  `a1f36a77-1732-44d4-8c3b-4623a6e6ed0c` (Ζωάλο Πουτς).
  Being host of an ordinary game does not confer diagnostics admin access.
- Non-admin users cannot list, download, toggle or delete diagnostic data.
  The dashboard route is also server-authorized, not just visually hidden.

## What is captured

Timing of local actions and responses; incoming authoritative revisions;
public discard/meld journal metadata; animation start, sprite creation, end,
and timeouts; UI frame gaps and long tasks; viewport size, OS/browser family,
visibility/background changes; browser error categories; end-of-match event.
There is no continuous screenshot/video or recording of hidden opponents'
cards, PINs, cookies, credentials, or complete server game states.

Events are best-effort metrics. A ZIP can identify **where to investigate**, but
cannot by itself prove visual continuity frame by frame. Pair with a short
video for subtle graphics glitches.

## Database and Free-plan discipline

Migration: `supabase/migrations/20261016090000_biriba_black_box.sql`.

- Only `biriba_debug_settings` and `biriba_debug_events` are created.
  No Storage bucket, permanent ZIP or game table is changed.
- Client events are batched (up to 30 per upload), kept in a bounded memory
  queue (250), and only uploaded while capture is enabled.
- Database rejects batches above 40 events / 20 KB; each event is limited
  to 1,400 characters and there is a limit of 2,500 events per room/player.
- Retention defaults to **7 days**, with opportunistic once-per-hour expiry
  upon any diagnostics API call. No background worker, paid cron task or
  realtime subscription is required.
- The admin can pause future collection without losing recorded data,
  delete a specific match, or (after two confirmation steps) delete ALL
  diagnostic records. Pause and deletion are distinct operations.
- When no one is using diagnostics, there is no automatic polling or cleanup
  worker on the server. Old entries expire at the next API interaction.
- Like any browser telemetry, very recent in-memory events can be lost on a
  sudden browser crash or disconnected network. These logs must not be
  treated as a complete transactional audit record.

## Admin workflow

1. Open Biriba as Ζωάλο Πουτς.
2. Choose **Black Box** from the lobby/table controls.
3. Filter by room, player or device. Open a match.
4. Download a ZIP for the whole match, a player, or one device session.
5. Upload the ZIP to Codex; `REPORT.md` includes investigation instructions,
   `timeline.json` the merged chronology, and `player_*.json` each client
   session. Match identifiers allow comparison across devices.
6. After analysis, purge individual sessions/matches or all diagnostics.
   Do not purge normal game tables.

## Activation

1. Review the migration and the PR on the correct Joker Supabase project.
2. Apply the migration and deploy the **corresponding** updated
   `supabase/functions/biriba-commands` Edge Function, preserving the existing
   `verify_jwt=false` configuration because this function uses Joker's opaque
   session-token authentication internally.
3. Deploy the frontend only after the RPC/Edge Function is available.
4. Validate: admin status and listing, denied non-admin listing,
   human+bot game upload, second-device upload, ZIP download, pause capture,
   and per-match purge; verify existing Biriba gameplay still works.

## Reversible removal — DO NOT run until separately approved

1. Pause capture via the admin dashboard and deploy client code with the
   recorder and dashboard removed (or gated off).
2. Confirm no new `diag_ingest` requests are arriving.
3. Export any diagnostic files still needed, then use **Clear all**.
4. After separate explicit approval, remove the `diag_*` Edge routes and
   `biribaDiagnostics` server adapter, and execute:

```sql
drop function if exists public.biriba_debug_internal(text,text,text,uuid,jsonb);
drop table if exists public.biriba_debug_events;
drop table if exists public.biriba_debug_settings;
```

No changes are needed to `public.players`, `biriba_rooms`,
`biriba_match_states`, Joker, Durak, or the session tables.
