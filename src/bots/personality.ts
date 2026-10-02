/**
 * Bot personality + reactions. Affects ONLY conversational output,
 * never strategy or rules.
 */
import type { BotSettings } from "@/domain/players";

export interface BotPersonality {
  id: string;
  defaultName: string;
  /** Predefined lines. Profane lines are kept separate and opt-in. */
  replies: string[];
  spicyReplies: string[];
}

export const BOT_PERSONALITIES: BotPersonality[] = [
  {
    id: "professor",
    defaultName: "Καθηγητής",
    replies: ["Ενδιαφέρουσα παρατήρηση.", "Υπολογίζω...", "Θα δούμε στο τέλος."],
    spicyReplies: ["Άσε τα λόγια, παίξε φύλλο."],
  },
  {
    id: "grandpa",
    defaultName: "Παππούς",
    replies: ["Στα χρόνια μου παίζαμε καλύτερα.", "Χμ.", "Υπομονή, παιδί μου."],
    spicyReplies: ["Μη με τσατίζεις τώρα!"],
  },
  {
    id: "showoff",
    defaultName: "Μάγκας",
    replies: ["Τα έχω όλα υπό έλεγχο 😎", "Έλα, έλα...", "Χαλαρά!"],
    spicyReplies: ["Θα σε κάνω σκόνη!"],
  },
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
