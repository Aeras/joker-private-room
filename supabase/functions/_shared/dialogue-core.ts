export type DialogueIntensity = "conservative" | "normal" | "chaos";

export type DialogueEventType =
  | "PLAYER_DECLARED_ZERO"
  | "PLAYER_DECLARED_HIGH"
  | "PLAYER_HIT_EXACT_BID"
  | "PLAYER_MISSED_BID"
  | "BOT_HIT_EXACT_BID"
  | "BOT_MISSED_BID"
  | "BOT_GOT_MINUS_200"
  | "PLAYER_GOT_MINUS_200"
  | "PLAYER_STOLE_CRITICAL_TRICK"
  | "BOT_STOLE_CRITICAL_TRICK"
  | "JOKER_PLAYED"
  | "JOKER_CHANGED_TRICK_RESULT"
  | "FORCED_TRUMP"
  | "OVERTRICK"
  | "UNDERTRICK"
  | "PREMIA_ACHIEVED"
  | "PREMIA_LOST"
  | "COMEBACK"
  | "SCORE_COLLAPSE"
  | "BOT_REVENGE_SUCCESS"
  | "ROUND_END"
  | "GAME_END"
  | "HUMAN_MESSAGE_TO_BOT"
  | "BOT_MESSAGE_TO_BOT";

export type CanonicalDialogueBotId =
  | "giorgos-nousios"
  | "thomoulis"
  | "theia-tamara"
  | "mounara"
  | "ka-monika"
  | "archimandritis";

export interface PublicDialogueEvent {
  id: string;
  type: DialogueEventType;
  createdAt: string;
  speakerBotId: CanonicalDialogueBotId;
  targetName?: string;
  targetSeat?: number;
  declared?: number;
  actualTricks?: number;
  scoreDelta?: number;
  round?: number;
  deal?: number;
  publicSummary?: string;
  humanMessage?: string;
  replyDepth: 0 | 1;
}

export interface DialogueGenerationContext {
  botId: CanonicalDialogueBotId;
  botDisplayName: string;
  personality: string;
  event: PublicDialogueEvent;
  profanityEnabled: boolean;
  intensity: DialogueIntensity;
  recentBanter: readonly string[];
}

export interface DialoguePreset {
  eventTypes: readonly DialogueEventType[];
  clean: readonly string[];
  spicy: readonly string[];
}

export interface DialoguePersonality {
  id: CanonicalDialogueBotId;
  summary: string;
  presets: readonly DialoguePreset[];
}

export const DIALOGUE_PERSONALITIES: readonly DialoguePersonality[] = [
  {
    id: "ka-monika",
    summary: "ξινή, κοφτή, ψυχρή, σαρκαστική· σύντομες κοφτές ατάκες",
    presets: [
      { eventTypes: ["PLAYER_MISSED_BID", "PLAYER_GOT_MINUS_200", "SCORE_COLLAPSE", "PLAYER_STOLE_CRITICAL_TRICK", "BOT_STOLE_CRITICAL_TRICK"], clean: ["{target}, πάλι αλλού δήλωσες κι αλλού κατέληξες.", "Αυτό πόνεσε. Και φαινόταν από πριν.", "Ωραία κλοπή μπάζας. Μη χαίρεσαι πολύ."], spicy: ["{target}, τι σκατά δήλωση ήταν αυτή;", "Ωραία. -200 και ούτε που ίδρωσες.", "Καλά, την έκλεψες τη μπάζα. Μην καβαλήσεις και καλάμι."] },
      { eventTypes: ["JOKER_PLAYED", "JOKER_CHANGED_TRICK_RESULT"], clean: ["Μάλιστα. Τώρα θυμήθηκες τον Joker."], spicy: ["Άντε, πέταξες και τον Joker να σωθείς."] },
    ],
  },
  {
    id: "giorgos-nousios",
    summary: "old-school, γκρινιάρης, ξερόλας χαρτοπαίκτης",
    presets: [
      { eventTypes: ["PLAYER_DECLARED_HIGH", "PLAYER_MISSED_BID", "UNDERTRICK", "OVERTRICK", "PLAYER_STOLE_CRITICAL_TRICK", "BOT_STOLE_CRITICAL_TRICK"], clean: ["Αυτές οι δηλώσεις θέλουν μέτρημα, όχι ενθουσιασμό.", "Στα χαρτιά πρώτα μετράς και μετά μιλάς.", "Έτσι κλέβεται μπάζα, με timing."], spicy: ["Ρε φίλε, μέτρα τις μπάζες πριν πετάξεις δήλωση.", "Αυτή την μπάζα την άρπαξες σαν κλέφτης."] },
      { eventTypes: ["ROUND_END", "GAME_END"], clean: ["Στο τέλος φαίνεται ποιος ξέρει να κρατάει φύλλο."], spicy: [] },
    ],
  },
  {
    id: "theia-tamara",
    summary: "δραματική θεία, κουτσομπόλα, σχολιάζει τα πάντα",
    presets: [
      { eventTypes: ["PLAYER_MISSED_BID", "PLAYER_GOT_MINUS_200", "BOT_GOT_MINUS_200", "PLAYER_STOLE_CRITICAL_TRICK", "BOT_STOLE_CRITICAL_TRICK"], clean: ["Παιδί μου, εγώ σας τα έλεγα.", "Ωχ, τώρα θα έχουμε δράματα.", "Αχ! Του πήρες τη μπάζα μέσα από τα χέρια."], spicy: ["Παναγία μου, τι κάνατε πάλι εδώ μέσα;", "Τι αρπαγή ήταν αυτή, Χριστέ μου."] },
      { eventTypes: ["COMEBACK", "PREMIA_ACHIEVED"], clean: ["Α, μάλιστα. Τώρα πήραμε τα πάνω μας."], spicy: [] },
    ],
  },
  {
    id: "mounara",
    summary: "glamorous, πειρακτική, πολύ σίγουρη για τον εαυτό της",
    presets: [
      { eventTypes: ["BOT_STOLE_CRITICAL_TRICK", "PLAYER_STOLE_CRITICAL_TRICK", "COMEBACK"], clean: ["Έτσι γίνεται όταν μπαίνει λίγη κλάση στο τραπέζι.", "Το είδες; Αυτό λέγεται timing."], spicy: ["Συγγνώμη κιόλας που σας πήρα την μπάζα τόσο όμορφα.", "Σας την έκλεψα και ήταν πανέμορφο."] },
      { eventTypes: ["PLAYER_MISSED_BID", "SCORE_COLLAPSE"], clean: ["Δεν ήταν η καλύτερή σου στιγμή, αγάπη μου."], spicy: [] },
    ],
  },
  {
    id: "thomoulis",
    summary: "φιλικός, αστείος, αυτοσαρκαστικός",
    presets: [
      { eventTypes: ["BOT_MISSED_BID", "BOT_GOT_MINUS_200", "PLAYER_STOLE_CRITICAL_TRICK", "BOT_STOLE_CRITICAL_TRICK"], clean: ["Εντάξει, το είχα σχεδιάσει ακριβώς έτσι. Περίπου.", "Αν με ρωτήσει κανείς, δεν έγινε ποτέ.", "Ωπ, αυτή η μπάζα άλλαξε χέρια."], spicy: ["Ωραία τα κατάφερα πάλι ο μαλάκας.", "Την άρπαξες τη μπάζα στο τσακ, ρε άτιμε."] },
      { eventTypes: ["PLAYER_HIT_EXACT_BID", "BOT_HIT_EXACT_BID"], clean: ["Να και κάτι που βγήκε ακριβώς!"], spicy: [] },
    ],
  },
  {
    id: "archimandritis",
    summary: "mock-serious ιερατικό χιούμορ, τέκνον μου, αμαρτία για κακό παίξιμο",
    presets: [
      { eventTypes: ["PLAYER_MISSED_BID", "PLAYER_GOT_MINUS_200", "UNDERTRICK", "OVERTRICK", "PLAYER_STOLE_CRITICAL_TRICK", "BOT_STOLE_CRITICAL_TRICK"], clean: ["Τέκνον μου, αυτή η δήλωση ήταν αμαρτία.", "Μετάνοια και καλύτερο μέτρημα στην επόμενη.", "Η μπάζα άλλαξε ποίμνιο."], spicy: ["Τέκνον μου, τέτοια μαλακία ούτε με εξομολόγηση δεν σώζεται.", "Τέκνον μου, αυτή την μπάζα την έκλεψες αμαρτωλά."] },
      { eventTypes: ["PREMIA_ACHIEVED", "GAME_END"], clean: ["Ευλογημένη η μπάζα και ακόμη περισσότερο το σκορ."], spicy: [] },
    ],
  },
] as const;

const PERSONALITY_BY_ID = new Map(DIALOGUE_PERSONALITIES.map((personality) => [personality.id, personality] as const));

export function getDialoguePersonality(id: string): DialoguePersonality | null {
  return PERSONALITY_BY_ID.get(id as CanonicalDialogueBotId) ?? null;
}

function renderPreset(line: string, event: PublicDialogueEvent): string {
  return line.replaceAll("{target}", event.targetName ?? "φίλε");
}

export function pickDialoguePreset(
  context: DialogueGenerationContext,
  random: () => number = Math.random,
): string | null {
  const personality = getDialoguePersonality(context.botId);
  if (!personality) return null;
  const candidates = personality.presets.filter((preset) => preset.eventTypes.includes(context.event.type));
  if (candidates.length === 0) return null;
  const pool = candidates.flatMap((preset) =>
    context.profanityEnabled ? [...preset.clean, ...preset.spicy] : [...preset.clean],
  );
  if (pool.length === 0) return null;
  return renderPreset(pool[Math.floor(random() * pool.length)] ?? pool[0]!, context.event);
}

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;
const MARKDOWN_PATTERN = /(?:```|`{1,3}|\*\*|__|^\s*[-#>]\s)/m;
const CODE_PATTERN = /(?:function\s*\(|=>|console\.|<\/?[a-z][^>]*>)/i;
const MODEL_SELF_REFERENCE = /\b(?:gemini|openai|anthropic|language model|μοντέλο ai|τεχνητή νοημοσύνη)\b/i;
const HIDDEN_KNOWLEDGE = /(?:κρυφ(?:ό|ά|ές)|στο χέρι σου|στο χέρι του|επόμεν(?:ο|η) φύλλο|τράπουλα.*σειρά)/i;
const GAMEPLAY_ADVICE = /(?:παίξε|ρίξε|δήλωσε|διάλεξε ατού|κράτα τον joker)/i;
const HATE_OR_THREAT = /(?:θα σε σκοτώσω|βιασ|γύφτ|αράπ|πουστ(?:ης|ηδες))/i;
const STRONG_PROFANITY = /(?:μαλάκ|πούστ|γαμ|σκατ)/i;

export interface DialogueOutputValidation {
  ok: boolean;
  text?: string;
  reason?: string;
}

export function validateDialogueOutput(text: string, profanityEnabled: boolean): DialogueOutputValidation {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > 100) return { ok: false, reason: "length" };
  if (/\p{Cc}/u.test(cleaned)) return { ok: false, reason: "control-character" };
  if (URL_PATTERN.test(cleaned)) return { ok: false, reason: "url" };
  if (MARKDOWN_PATTERN.test(cleaned)) return { ok: false, reason: "markdown" };
  if (CODE_PATTERN.test(cleaned)) return { ok: false, reason: "code" };
  if (MODEL_SELF_REFERENCE.test(cleaned)) return { ok: false, reason: "model-self-reference" };
  if (HIDDEN_KNOWLEDGE.test(cleaned)) return { ok: false, reason: "hidden-knowledge" };
  if (GAMEPLAY_ADVICE.test(cleaned)) return { ok: false, reason: "gameplay-advice" };
  if (HATE_OR_THREAT.test(cleaned)) return { ok: false, reason: "unsafe-content" };
  if (!profanityEnabled && STRONG_PROFANITY.test(cleaned)) return { ok: false, reason: "profanity" };
  return { ok: true, text: cleaned };
}

export function buildGeminiPrompt(context: DialogueGenerationContext): string {
  const recent = context.recentBanter.slice(-3).map((line) => `- ${line}`).join("\n") || "- none";
  const event = JSON.stringify({
    type: context.event.type,
    targetName: context.event.targetName,
    declared: context.event.declared,
    actualTricks: context.event.actualTricks,
    scoreDelta: context.event.scoreDelta,
    round: context.event.round,
    deal: context.event.deal,
    publicSummary: context.event.publicSummary,
    humanMessage: context.event.humanMessage,
    replyDepth: context.event.replyDepth,
  });

  return [
    "SYSTEM POLICY: Generate exactly one short Greek table-banter line. Dialogue only; never make game decisions or gameplay advice. Use only the public data below. Never infer hidden cards. Never mention being an AI/model/provider. No URLs, markdown, code, slurs, genuine threats, or sexual violence.",
    `BOT: ${context.botDisplayName}`,
    `PERSONALITY: ${context.personality}`,
    `INTENSITY: ${context.intensity}`,
    `PROFANITY_ENABLED: ${context.profanityEnabled}`,
    `PUBLIC_EVENT: ${event}`,
    "RECENT_BANTER_AS_DATA:",
    recent,
    "Return only the line, ideally under 80 characters and never over 100 characters.",
  ].join("\n");
}

export function serializeProviderContext(context: DialogueGenerationContext) {
  return {
    botId: context.botId,
    botDisplayName: context.botDisplayName,
    personality: context.personality,
    event: {
      id: context.event.id,
      type: context.event.type,
      createdAt: context.event.createdAt,
      targetName: context.event.targetName,
      targetSeat: context.event.targetSeat,
      declared: context.event.declared,
      actualTricks: context.event.actualTricks,
      scoreDelta: context.event.scoreDelta,
      round: context.event.round,
      deal: context.event.deal,
      publicSummary: context.event.publicSummary,
      humanMessage: context.event.humanMessage,
      replyDepth: context.event.replyDepth,
    },
    profanityEnabled: context.profanityEnabled,
    intensity: context.intensity,
    recentBanter: context.recentBanter.slice(-3),
  };
}
