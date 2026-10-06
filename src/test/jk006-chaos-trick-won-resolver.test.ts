import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const resolver = readFileSync(
  "supabase/migrations/20261006144500_jk006_chaos_trick_won_resolver.sql",
  "utf8",
);

describe("Chaos TRICK_WON resolver", () => {
  it("validates the event from public completed-trick state and Chaos policy", () => {
    expect(resolver).toContain("v_event_type = 'TRICK_WON'");
    expect(resolver).toContain("coalesce(v_dialogue_intensity, 'normal') <> 'chaos'");
    expect(resolver).toContain("(v_state #> '{cards,completedTricks}') -> -1");
    expect(resolver).toContain("winnerSeat");
    expect(resolver).toContain("play #>> '{card,kind}' = 'joker'");
    expect(resolver).toContain("'replyDepth', 0");
  });

  it("preserves service-role-only execution for the resolver", () => {
    expect(resolver).toContain(
      "revoke all on function public.resolve_dialogue_state_event_internal(text, uuid, text)",
    );
    expect(resolver).toContain("to service_role");
  });
});
