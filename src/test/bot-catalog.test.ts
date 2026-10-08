import { describe, expect, it } from "vitest";

import {
  BOT_CATALOG_VERSION,
  CANONICAL_BOTS,
  deterministicBotOrder,
  getCanonicalBot,
  publicBotCatalog,
} from "../../supabase/functions/_shared/bot-catalog";

const expectedRoster = [
  ["giorgos-nousios", "Γιώργος Νούσιος", "/avatars/giorgos_nousios.png", 1, "strong-basic-v1"],
  ["thomoulis", "Θωμούλης", "/avatars/thomoulis.png", 2, "memory-inference-v1"],
  ["theia-tamara", "Θεία Ταμάρα", "/avatars/theia_tamara.png", 1, "strong-basic-v1"],
  ["mounara", "Μουνάρα", "/avatars/mounara.png", 2, "memory-inference-v1"],
  ["ka-monika", "κα. Μόνικα", "/avatars/ka_monika.png", 3, "probability-simulation-v1"],
  ["archimandritis", "Αρχι...μανδρίτης", "/avatars/archimandritis.png", 3, "probability-simulation-v1"],
] as const;

describe("canonical permanent bot catalog", () => {
  it("contains exactly the locked six with exact names, avatars and tier mapping", () => {
    expect(CANONICAL_BOTS).toHaveLength(6);
    expect(
      CANONICAL_BOTS.map((bot) => [
        bot.id,
        bot.displayName,
        bot.avatarUrl,
        bot.tier,
        bot.strategyProfileId,
      ]),
    ).toEqual(expectedRoster);
    expect(new Set(CANONICAL_BOTS.map((bot) => bot.id)).size).toBe(6);
    expect(CANONICAL_BOTS.every((bot) => bot.catalogVersion === BOT_CATALOG_VERSION)).toBe(true);
  });

  it("keeps the confirmed two-bot tier pairs", () => {
    const byTier = (tier: 1 | 2 | 3) =>
      CANONICAL_BOTS.filter((bot) => bot.tier === tier).map((bot) => bot.displayName).sort();
    expect(byTier(1)).toEqual(["Γιώργος Νούσιος", "Θεία Ταμάρα"].sort());
    expect(byTier(2)).toEqual(["Μουνάρα", "Θωμούλης"].sort());
    expect(byTier(3)).toEqual(["Αρχι...μανδρίτης", "κα. Μόνικα"].sort());
  });

  it("contains neither confirmed humans nor legacy production bot identities", () => {
    const serialized = JSON.stringify(CANONICAL_BOTS).toLowerCase();
    for (const forbidden of [
      "mixalis",
      "git",
      "giobis",
      "grisha",
      "serge",
      "valeria",
      "babis",
      "captain",
      "γκρίσα",
      "σερζ",
      "βαλέρια",
      "μπάμπης",
      "καπετάνιος",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("resolves only stable canonical IDs", () => {
    expect(getCanonicalBot("theia-tamara")?.displayName).toBe("Θεία Ταμάρα");
    expect(getCanonicalBot("tamara")).toBeNull();
    expect(getCanonicalBot("grisha")).toBeNull();
    expect(getCanonicalBot("Mixalis")).toBeNull();
  });

  it("marks already-used identities unavailable without mutating catalog truth", () => {
    const projection = publicBotCatalog(["mounara", "ka-monika"]);
    expect(projection.bots.find((bot) => bot.id === "mounara")?.available).toBe(false);
    expect(projection.bots.find((bot) => bot.id === "ka-monika")?.available).toBe(false);
    expect(projection.bots.find((bot) => bot.id === "thomoulis")?.available).toBe(true);
    expect(CANONICAL_BOTS.every((bot) => !("available" in bot))).toBe(true);
  });
});

describe("retry-stable Start bot ordering", () => {
  const input = {
    roomCode: "A7K9",
    actionId: "11111111-2222-4333-8444-555555555555",
    expectedRoomVersion: 7,
  };

  it("returns the exact same unique ordering for the same Start intention", () => {
    const first = deterministicBotOrder(input).map((bot) => bot.id);
    const second = deterministicBotOrder(input).map((bot) => bot.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(6);
  });

  it("binds ordering to the Start action/version seed", () => {
    const base = deterministicBotOrder(input).map((bot) => bot.id);
    const changedAction = deterministicBotOrder({
      ...input,
      actionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    }).map((bot) => bot.id);
    const changedVersion = deterministicBotOrder({ ...input, expectedRoomVersion: 8 }).map((bot) => bot.id);

    expect(changedAction).not.toEqual(base);
    expect(changedVersion).not.toEqual(base);
  });
});
