export type BotStrengthTier = 1 | 2 | 3;

export type CanonicalBotId =
  | "giorgos-nousios"
  | "thomoulis"
  | "theia-tamara"
  | "mounara"
  | "ka-monika"
  | "archimandritis";

export type BotStrategyProfileId =
  | "strong-basic-v1"
  | "memory-inference-v1"
  | "probability-simulation-v1";

export interface CanonicalBotDefinition {
  id: CanonicalBotId;
  displayName: string;
  avatarUrl: string;
  personalityId: CanonicalBotId;
  tier: BotStrengthTier;
  strategyProfileId: BotStrategyProfileId;
  catalogVersion: typeof BOT_CATALOG_VERSION;
  rulesVersion: typeof BOT_RULES_VERSION;
}

export const BOT_RULES_VERSION = "popular-v1" as const;
export const BOT_CATALOG_VERSION = "popular-bots-v1" as const;

export const CANONICAL_BOTS: readonly CanonicalBotDefinition[] = [
  {
    id: "giorgos-nousios",
    displayName: "Γιώργος Νούσιος",
    avatarUrl: "/avatars/giorgos_nousios.png",
    personalityId: "giorgos-nousios",
    tier: 1,
    strategyProfileId: "strong-basic-v1",
    catalogVersion: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
  },
  {
    id: "thomoulis",
    displayName: "Θωμούλης",
    avatarUrl: "/avatars/thomoulis.png",
    personalityId: "thomoulis",
    tier: 2,
    strategyProfileId: "memory-inference-v1",
    catalogVersion: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
  },
  {
    id: "theia-tamara",
    displayName: "Θεία Ταμάρα",
    avatarUrl: "/avatars/theia_tamara.png",
    personalityId: "theia-tamara",
    tier: 1,
    strategyProfileId: "strong-basic-v1",
    catalogVersion: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
  },
  {
    id: "mounara",
    displayName: "Μουνάρα",
    avatarUrl: "/avatars/mounara.png",
    personalityId: "mounara",
    tier: 2,
    strategyProfileId: "memory-inference-v1",
    catalogVersion: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
  },
  {
    id: "ka-monika",
    displayName: "κα. Μόνικα",
    avatarUrl: "/avatars/ka_monika.png",
    personalityId: "ka-monika",
    tier: 3,
    strategyProfileId: "probability-simulation-v1",
    catalogVersion: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
  },
  {
    id: "archimandritis",
    displayName: "Αρχι...μανδρίτης",
    avatarUrl: "/avatars/archimandritis.png",
    personalityId: "archimandritis",
    tier: 3,
    strategyProfileId: "probability-simulation-v1",
    catalogVersion: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
  },
] as const;

const BOT_BY_ID = new Map(CANONICAL_BOTS.map((bot) => [bot.id, bot] as const));

export function getCanonicalBot(id: string): CanonicalBotDefinition | null {
  return BOT_BY_ID.get(id as CanonicalBotId) ?? null;
}

function stableHash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Produces one retry-stable pseudo-random ordering for Start Game.
 * Identity randomness is not security-sensitive; determinism is required for
 * idempotency and lost-response retries.
 */
export function deterministicBotOrder(input: {
  roomCode: string;
  actionId: string;
  expectedRoomVersion: number;
  rulesVersion?: string;
}): CanonicalBotDefinition[] {
  const rulesVersion = input.rulesVersion ?? BOT_RULES_VERSION;
  const seed = [
    input.roomCode.toUpperCase(),
    input.actionId.toLowerCase(),
    String(input.expectedRoomVersion),
    rulesVersion,
    BOT_CATALOG_VERSION,
  ].join("|");

  return [...CANONICAL_BOTS].sort((left, right) => {
    const leftHash = stableHash32(`${seed}|${left.id}`);
    const rightHash = stableHash32(`${seed}|${right.id}`);
    return leftHash - rightHash || left.id.localeCompare(right.id);
  });
}

export function publicBotCatalog(usedBotIds: Iterable<string> = []) {
  const used = new Set(usedBotIds);
  return {
    version: BOT_CATALOG_VERSION,
    rulesVersion: BOT_RULES_VERSION,
    bots: CANONICAL_BOTS.map((bot) => ({
      id: bot.id,
      displayName: bot.displayName,
      avatarUrl: bot.avatarUrl,
      tier: bot.tier,
      strategyProfileId: bot.strategyProfileId,
      available: !used.has(bot.id),
    })),
  };
}
