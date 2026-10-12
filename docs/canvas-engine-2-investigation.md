# JOKER Canvas Engine 2.0 — source investigation and migration boundaries

Source: GitHub main `7f3110ce84b5af1fca0d194ae2bd85565636a4f8`. This document is written before the Canvas implementation. No production database, Lovable, deployment or rules changes are required.

## Actual architecture

- React 19, TypeScript, TanStack Start/Router file routes, Vite 8 and Tailwind 4. Server functions in `src/services/*Functions.ts` validate input with Zod; they are not browser-authoritative commands. No rendering framework is needed.
- `src/routes/create.tsx`, `join.tsx`, `room.tsx` and `table.tsx` provide authenticated creation, joining, waiting and gameplay. `PlayerSessionGate`, `authFunctions`, `realIdentity`, `roomFunctions` preserve the existing PIN/session and membership flow. The external owner's Supabase is the only backend.
- `src/domain/rulesets.ts` defines Popular (36 cards, chooser for nine-card trump), Classic (38 cards, revealed trump), Minus (Popular deck/trump with -100 per missing declared trick). Canonical scoring, premia, legality and Joker rules stay in domain/server modules. A renderer must not branch on these policies.
- `gameProjectionFunctions.ts` calls authenticated persistence/reconciliation and projects with the server-derived viewer seat. `gameplayCommands.ts` validates human controller, expected version and semantic command before CAS persistence. `gamePersistence.ts` calls the external `game-state` Edge endpoint with the session cookie. Canvas must never see canonical hands or the deck.
- The live table uses single-flight polling, not an active Supabase Realtime gameplay subscription. `src/services/ephemeral.ts` is a local abstraction, not evidence of deployed gameplay Realtime. Bot actor reads start immediately then poll every 200ms; human waiting falls back to 1500ms. Rooms are read in parallel and coherent game snapshots can be admitted first. Snapshot admission rejects older versions; return synchronization hydrates settled presentation after reconnect.
- Current server reads already use request-local reconciliation: normal bot request = two authenticated reads and one CAS write. The strategy is bounded and unchanged. The live request budget is one automatic step; durable simulations have separate bounds.
- Ordinary and nine-card deal barriers remain authoritative. Played-event acknowledgements are legacy recovery; `reconciliationCore.ts` releases old boundaries without depending on foreground animation completion. Do not reinstate a global animation lock.

## Current presentation and input

- `presentationTiming.ts`, `PresentationRun`, `TrickPresentationJournal` and completion markers own timing, cancellation and ordered public snapshots. Bot plays received together are journaled rather than rendered as a single jump; scores stay latched through collection.
- `DealPresentation`, `DealerSelectionPresentation`, `LocalHandRow`, `TrumpDeckMotion` and `TrickPresentation` currently use DOM/CSS/WAAPI. Geometry is measured and frozen per active flight/trick. Nine-card hand overlap and the established table/avatar layout must remain unchanged.
- `LocalFlightCard` is the migration seam: it draws an optimistic copy of the local card while the canonical surface is suppressed. Landing and authoritative acceptance are independent; acceptance does not restart the flight, rejection returns it, and unmount invalidates callbacks. The canvas path must preserve both gates.
- `DraggableHandCard` owns touch pointer capture, release geometry, mouse double-click and keyboard input. `GameTable` submits via the existing authorized callback and retry-stable command IDs. Keep these accessible DOM controls; Canvas is a pointer-transparent visual owner, not a second input/game engine.
- Joker stays still while choosing semantics. `JokerChoicePicker` uses fullscreen-root portals and touch pointer-up activation. FROM_BELOW flip, lower layering and leading Joker announcements are sensitive and remain on the existing DOM path in the first integration.
- `assets/registry.ts` maps existing faces/backs. `cardPreload.ts` and `PlayingCard.tsx` avoid a blank face when an already-ready asset remounts. Canvas must draw only a decoded existing asset or keep DOM ownership for that entire flight. No artwork redesign.
- Landscape/fullscreen guards, `useTableGeometry`, `useReducedMotion` and foreground recovery handle viewport/input. Timers use owner-local generations. A new RAF loop must stop on unmount/background and invalidate callbacks even if a cancelled frame is delivered.

## Staged decision

1. Renderer-independent scene/intent/flight instructions from authorized projections; an elapsed-time scheduler and bounded Canvas 2D layer with DPR handling and disposal.
2. Integrate ordinary local human card flight, including acceptance and rejection, directly into `TrickPresentation` through the existing `LocalFlightCard` seam. All three rulesets use it. Only one visual owner; decoded assets/context capability are prerequisites. Cold images, unsupported Canvas, Joker and explicit internal DOM override retain the old renderer.
3. Prepare generic sprite layering/flip/tween primitives. Keep dealing, full hand, remote/bot flights, collection and Joker on DOM until their full lifecycle is independently migrated. Do not claim a complete Canvas table.
4. Investigate polling latency separately. Avoid raw `postgres_changes` on canonical game rows: the payload could expose hidden cards. Realtime requires an authenticated sanitized notification contract and publication/security review; no such schema change is authorized here. A bounded public-state polling improvement can be tested without changing rules or production schema.

## Verification boundaries

Run focused engine/adapter/lifecycle tests, existing motion/asset/Joker/return tests, TypeScript, scoped lint, production build and required CI. Actual browser fixtures must import the real components, real artwork and canonical/public projection code; stubs may replace transport only. Exercise Popular/Classic/Minus, authority delays/rejection, background/resize, reduced motion, cold/context-failure fallback and cleanup. Headless browser tests are not physical Android/iPhone tests or production network benchmarks.

Feature branch is based on the canonical GitHub SHA above. Small commits and a review PR only; no merge, Publish, Lovable calls, production writes or migrations.
