# DURAK clockwise seats, bot setup and slower opening

Four-player display order is bottom → left → top → right. Canonical turn and
adjacent-attacker logic are unchanged. Layouts with 3–6 players follow the same
direction. Finished players continue to be skipped by the canonical engine.

Waiting seats use the existing JOKER PlayerAvatar and shared canonical bot catalog.
The host can assign, replace or remove a bot in a specific nonhuman seat. Starting
fills only empty seats (and normalizes legacy placeholder bots), preserving humans
and selected bots. One service-only session-validated SQL transaction locks the
room, fills seats and calls the existing canonical start. Joining uses that same
room lock, so concurrent join/start cannot overwrite a human seat.

Deal stagger is 90 ms; card flight 420 ms; trump flip 550 ms; stock placement 600 ms.
Four-player presentation takes 3,880 ms, plus the existing 1,000 ms arrival lead.
The persisted server barrier and client overlay share identical timing constants.

## Verification

- Full pre-PR suite: 899 tests / 145 files, including existing JOKER tests.
- Additional handler checks: 3 tests passing (trusted catalog, invalid IDs/seats,
  canonical six-card deal through one atomic setup transaction).
- TypeScript, targeted lint, production build and Deno bot-turn dependency graph pass.
- Actual SQL exercised in PGlite: 80 assertions across both variants and 2–6 seats,
  checking authorization, human-seat protection, duplicate rejection, chosen-bot
  preservation, auto-fill, invalid-state rejection and repeat-start rejection.
- Browser QA using the real route, cards, catalog and canonical engine with an
  isolated service fixture: 844×390, 568×320 (six seats), 1280×591. Verified selection,
  auto-fill, closed dealing, trump flip/placement, six open local cards, no early bot
  action and no fullscreen scroll overflow. No production login was simulated.

Run the SQL harness from the repository root, with PGlite installed or its package
path supplied (it is a QA-only dependency, not included in the application):

```sh
node scripts/verify-durak-lobby.cjs /absolute/path/to/@electric-sql/pglite
```

Migration `20261011140947_durak_named_bot_seats_autofill.sql` was applied to the
owner's external Supabase; filename matches the recorded remote migration version.
Verified anon/authenticated execution is denied, service_role execution is allowed,
and an invalid session returns NOT_AUTHENTICATED. Security advisor reports only
the existing informational no-policy notices for service-only DURAK tables.

No JOKER components, rules, assets, game storage or bot strategies were modified.
