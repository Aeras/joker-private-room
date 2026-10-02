<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- `src/domain/` holds pure, UI-free game logic (cards, gameConfig, scoring, rulesets, scoreSheet, engine types); components never duplicate rules or hardcode deal/phase numbers — why: single source of truth, testable.
- Ruleset differences go through `Ruleset` in `src/domain/rulesets.ts` (e.g. `calculatePhaseBonus`); undocumented rules stay as empty extension points — why: never guess rules.
- Bots: strategy (`src/bots/strategy.ts`) receives only `PlayerView`; personality/reactions are separate and never affect play — why: strong but fair bots.
- Backend access goes through service interfaces in `src/services/`; all mock/demo code lives in `src/demo/` and must be removable — why: future server-authoritative backend.
- Never put PINs/secrets or authoritative game logic (deal, legality, scoring of record) in client code for production — why: clients are untrusted.
- Visual assets are resolved via `src/assets/registry.ts`; components fall back to placeholders — why: final artwork supplied later.
- UI strings live in `src/i18n/el.ts` — why: easy future localization.
- The only backend is the owner's external Supabase via `src/integrations/external-supabase/client.ts`; never import `src/integrations/supabase/*` (Lovable Cloud, auto-generated, unused) — why: owner's explicit choice. Schema changes are SQL files the owner runs himself.
