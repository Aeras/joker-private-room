/**
 * Bot personality + reactions. Affects ONLY conversational output,
 * never strategy, tier selection or rules. Canonical identity metadata lives
 * in the versioned bot catalog, not in this presentation module.
 */
import type { BotSettings } from "@/domain/players";

export interface BotPersonality {
  id: string;
  replies: string[];
  spicyReplies: string[];
}

export const BOT_PERSONALITIES: BotPersonality[] = [
  { id: "giorgos-nousios", replies: [], spicyReplies: [] },
  { id: "thomoulis", replies: [], spicyReplies: [] },
  {
    id: "theia-tamara",
    replies: ["Εγώ σας τα έλεγα.", "Άντε να δούμε τι κρατάτε.", "Μη βιάζεσαι, παιδί μου."],
    spicyReplies: ["Άσε τα κόλπα και παίξε φύλλο."],
  },
  { id: "mounara", replies: [], spicyReplies: [] },
  { id: "ka-monika", replies: [], spicyReplies: [] },
  { id: "archimandritis", replies: [], spicyReplies: [] },
];

export type ReactionEvent = { type: "message_received"; fromName: string };

export function pickBotReply(
  personalityId: string,
  settings: BotSettings,
  _event: ReactionEvent,
  random: () => number = Math.random,
): string | null {
  if (!settings.botsTalk) return null;
  const p = BOT_PERSONALITIES.find((x) => x.id === personalityId);
  if (!p) return null;
  const pool = settings.allowProfanity ? [...p.replies, ...p.spicyReplies] : p.replies;
  return pool[Math.floor(random() * pool.length)] ?? null;
}
