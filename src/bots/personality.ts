/**
 * Bot personality + reactions. Affects ONLY conversational output,
 * never strategy or rules.
 */
import type { BotSettings } from "@/domain/players";

export interface BotPersonality {
  id: string;
  defaultName: string;
  replies: string[];
  spicyReplies: string[];
}

export const BOT_PERSONALITIES: BotPersonality[] = [
  {
    id: "tamara",
    defaultName: "Θεία Ταμάρα",
    replies: ["Εγώ σας τα έλεγα.", "Άντε να δούμε τι κρατάτε.", "Μη βιάζεσαι, παιδί μου."],
    spicyReplies: ["Άσε τα κόλπα και παίξε φύλλο."],
  },
  {
    id: "grisha",
    defaultName: "Γκρίσα ο Ύποπτος",
    replies: ["Κάτι δεν μου αρέσει εδώ...", "Σε παρακολουθώ.", "Χμ. Πολύ βολικό."],
    spicyReplies: ["Μη μου κάνεις τον αθώο τώρα."],
  },
  {
    id: "serge",
    defaultName: "Σερζ ο Μαθηματικός",
    replies: ["Οι πιθανότητες είναι μαζί μου.", "Το υπολόγισα.", "Στατιστικά, αυτό ήταν αναμενόμενο."],
    spicyReplies: ["Τα μαθηματικά δεν συγχωρούν."],
  },
  {
    id: "valeria",
    defaultName: "Βαλέρια η Επικίνδυνη",
    replies: ["Ρίσκαρέ το.", "Μου αρέσει αυτό το φύλλο.", "Τώρα αρχίζει το ενδιαφέρον."],
    spicyReplies: ["Θα το μετανιώσεις αυτό."],
  },
  {
    id: "babis",
    defaultName: "Μπάμπης ο Χαλαρός",
    replies: ["Χαλαρά, έχουμε χρόνο.", "Μια χαρά πάει.", "Παίξε και βλέπουμε."],
    spicyReplies: ["Μην το ζορίζεις τόσο."],
  },
  {
    id: "captain",
    defaultName: "Καπετάνιος",
    replies: ["Πρόσω ολοταχώς.", "Κρατάμε πορεία.", "Έχω δει χειρότερες φουρτούνες."],
    spicyReplies: ["Θα σε ρίξω στη θάλασσα με αυτά που παίζεις."],
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
