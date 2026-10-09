# Supported rulesets

The application supports Popular, Classic and Minus only. The removed fourth
variant has no selectable entry, strategy/simulation support, reserved-hand
allocation, target-player state or identity masking in executable application
code. Every gameplay deck uses the existing canonical uniform shuffle.

The forward migration replaces selectable-options, create-room, history,
room-projection, snapshot validation and Bot Lab RPCs without changing their
authorization boundaries. New or updated database rows must use one of the
three supported identity/version pairs. Existing completed records are retained
by NOT VALID constraints; they are excluded from supported projections rather
than relabelled as another game. The migration aborts if an unsupported active
game, lobby or queued/running laboratory job exists.

Previously applied migrations and original research documents remain historical
records. They do not enable a removed variant after the forward migration.
Player names/avatar aliases are unrelated to variant selection and remain intact.

Verification: 105 test files / 685 tests; strict TypeScript; production build;
isolated PostgreSQL-compatible integration via
`scripts/rulesets-retirement-db-test.mjs`, including RPC and database rejection,
permissions, supported canonical starts and Classic deck validation. Live schema
and worker verification is reported with the delivery.
