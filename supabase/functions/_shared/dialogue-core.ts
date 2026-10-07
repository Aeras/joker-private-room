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
  | "TRICK_WON"
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
      { eventTypes: ["PLAYER_MISSED_BID", "PLAYER_GOT_MINUS_200", "SCORE_COLLAPSE"], clean: ["{target}, πάλι αλλού δήλωσες κι αλλού κατέληξες.", "Αυτό πόνεσε. Και φαινόταν από πριν."], spicy: ["{target}, τι σκατά δήλωση ήταν αυτή;", "Ωραία. -200 και ούτε που ίδρωσες."] },
      { eventTypes: ["JOKER_PLAYED", "JOKER_CHANGED_TRICK_RESULT"], clean: ["Μάλιστα. Τώρα θυμήθηκες τον Joker."], spicy: ["Άντε, πέταξες και τον Joker να σωθείς."] },
      { eventTypes: ["TRICK_WON"], clean: ["{target}, πήρες κι αυτή. Μην το συνηθίσεις."], spicy: ["{target}, άντε γαμώτο, πάλι δική σου η μπάζα."] },
    ],
  },
  {
    id: "giorgos-nousios",
    summary: "old-school, γκρινιάρης, ξερόλας χαρτοπαίκτης",
    presets: [
      { eventTypes: ["PLAYER_DECLARED_HIGH", "PLAYER_MISSED_BID", "UNDERTRICK", "OVERTRICK"], clean: ["Αυτές οι δηλώσεις θέλουν μέτρημα, όχι ενθουσιασμό.", "Στα χαρτιά πρώτα μετράς και μετά μιλάς."], spicy: ["Ρε φίλε, μέτρα τις μπάζες πριν πετάξεις δήλωση."] },
      { eventTypes: ["ROUND_END", "GAME_END"], clean: ["Στο τέλος φαίνεται ποιος ξέρει να κρατάει φύλλο."], spicy: [] },
      { eventTypes: ["TRICK_WON"], clean: ["{target}, αυτή τη μπάζα την πήρες σωστά."], spicy: ["{target}, καλά, μη χέσω, μία μπάζα πήρες."] },
    ],
  },
  {
    id: "theia-tamara",
    summary: "δραματική θεία, κουτσομπόλα, σχολιάζει τα πάντα",
    presets: [
      { eventTypes: ["PLAYER_MISSED_BID", "PLAYER_GOT_MINUS_200", "BOT_GOT_MINUS_200"], clean: ["Παιδί μου, εγώ σας τα έλεγα.", "Ωχ, τώρα θα έχουμε δράματα."], spicy: ["Παναγία μου, τι κάνατε πάλι εδώ μέσα;"] },
      { eventTypes: ["COMEBACK", "PREMIA_ACHIEVED"], clean: ["Α, μάλιστα. Τώρα πήραμε τα πάνω μας."], spicy: [] },
      { eventTypes: ["TRICK_WON"], clean: ["{target}, πάλι εσύ; Θα μας τρελάνεις."], spicy: ["{target}, έλεος πια, πάλι την πήρες;"] },
    ],
  },
  {
    id: "mounara",
    summary: "glamorous, πειρακτική, πολύ σίγουρη για τον εαυτό της",
    presets: [
      { eventTypes: ["BOT_STOLE_CRITICAL_TRICK", "PLAYER_STOLE_CRITICAL_TRICK", "COMEBACK"], clean: ["Έτσι γίνεται όταν μπαίνει λίγη κλάση στο τραπέζι.", "Το είδες; Αυτό λέγεται timing."], spicy: ["Συγγνώμη κιόλας που σας πήρα την μπάζα τόσο όμορφα."] },
      { eventTypes: ["PLAYER_MISSED_BID", "SCORE_COLLAPSE"], clean: ["Δεν ήταν η καλύτερή σου στιγμή, αγάπη μου."], spicy: [] },
      { eventTypes: ["TRICK_WON"], clean: ["{target}, ωραίο timing. Το παραδέχομαι."], spicy: ["{target}, εντάξει μωρή, την πήρες. Χάρηκες;"] },
    ],
  },
  {
    id: "thomoulis",
    summary: "φιλικός, αστείος, αυτοσαρκαστικός",
    presets: [
      { eventTypes: ["BOT_MISSED_BID", "BOT_GOT_MINUS_200"], clean: ["Εντάξει, το είχα σχεδιάσει ακριβώς έτσι. Περίπου.", "Αν με ρωτήσει κανείς, δεν έγινε ποτέ."], spicy: ["Ωραία τα κατάφερα πάλι ο μαλάκας."] },
      { eventTypes: ["PLAYER_HIT_EXACT_BID", "BOT_HIT_EXACT_BID"], clean: ["Να και κάτι που βγήκε ακριβώς!"], spicy: [] },
      { eventTypes: ["TRICK_WON"], clean: ["{target}, μπράβο. Εγώ θα κάνω πως δεν πονάει."], spicy: ["{target}, γαμώτο, αυτή ήταν δική σου."] },
    ],
  },
  {
    id: "archimandritis",
    summary: "mock-serious ιερατικό χιούμορ, τέκνον μου, αμαρτία για κακό παίξιμο",
    presets: [
      { eventTypes: ["PLAYER_MISSED_BID", "PLAYER_GOT_MINUS_200", "UNDERTRICK", "OVERTRICK"], clean: ["Τέκνον μου, αυτή η δήλωση ήταν αμαρτία.", "Μετάνοια και καλύτερο μέτρημα στην επόμενη."], spicy: ["Τέκνον μου, τέτοια μαλακία ούτε με εξομολόγηση δεν σώζεται."] },
      { eventTypes: ["PREMIA_ACHIEVED", "GAME_END"], clean: ["Ευλογημένη η μπάζα και ακόμη περισσότερο το σκορ."], spicy: [] },
      { eventTypes: ["TRICK_WON"], clean: ["Τέκνον {target}, ευλογημένη η μπάζα σου."], spicy: ["Τέκνον {target}, πάλι εσύ τη γάμησες τη μπάζα." ] },
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

export const RECENT_BANTER_LIMIT = 10;

const HUMAN_MESSAGE_FALLBACKS: Record<CanonicalDialogueBotId, { clean: readonly string[]; spicy: readonly string[] }> = {
  "ka-monika": { clean: ["Σε άκουσα. Τώρα συγκεντρώσου λίγο.", "Καλά, το σημείωσα. Μη φουσκώνεις."], spicy: ["Σε άκουσα ρε. Μη μου τα πρήζεις τώρα."] },
  "giorgos-nousios": { clean: ["Σε άκουσα. Στο τραπέζι θα τα πούμε.", "Καλά τα λόγια· να δούμε και το φύλλο."], spicy: ["Σε άκουσα ρε μαλάκα. Παίξε και βλέπουμε."] },
  "theia-tamara": { clean: ["Αχ, σε άκουσα παιδί μου. Τι άλλο θα ακούσω;", "Καλά, καλά. Όλο ιστορίες είστε."], spicy: ["Παναγία μου, τι μου λες πάλι;"] },
  "mounara": { clean: ["Σε άκουσα, αγάπη μου. Μην ενθουσιάζεσαι.", "Καλά, κράτα λίγο μυστήριο."], spicy: ["Σε άκουσα μωρή. Μην παίρνεις και θάρρος."] },
  "thomoulis": { clean: ["Σε άκουσα. Εγώ πάντως δεν φταίω.", "Οκέι, το δέχομαι. Με επιφύλαξη."], spicy: ["Σε άκουσα ρε μαλάκα, χαλάρωσε λίγο."] },
  "archimandritis": { clean: ["Σε άκουσα, τέκνον μου. Υπομονή.", "Τέκνον μου, καταγράφηκε η αμαρτία."], spicy: ["Σε άκουσα τέκνον μου. Μη λες μαλακίες τώρα."] },
};

export function normalizeDialogueLine(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recentText(value: string): string {
  const colon = value.indexOf(":");
  return colon >= 0 ? value.slice(colon + 1).trim() : value.trim();
}

export function dialogueLineTooSimilar(candidate: string, recent: readonly string[]): boolean {
  const normalized = normalizeDialogueLine(candidate);
  if (!normalized) return true;
  const tokens = new Set(normalized.split(" ").filter((token) => token.length > 1));
  return recent.slice(-RECENT_BANTER_LIMIT).some((line) => {
    const other = normalizeDialogueLine(recentText(line));
    if (!other) return false;
    if (normalized === other) return true;
    if (normalized.length >= 12 && other.length >= 12 && (normalized.includes(other) || other.includes(normalized))) return true;
    const otherTokens = new Set(other.split(" ").filter((token) => token.length > 1));
    if (tokens.size < 3 || otherTokens.size < 3) return false;
    let shared = 0;
    for (const token of tokens) if (otherTokens.has(token)) shared += 1;
    return shared / Math.min(tokens.size, otherTokens.size) >= 0.72;
  });
}

export function pickDialoguePreset(
  context: DialogueGenerationContext,
  random: () => number = Math.random,
): string | null {
  const personality = getDialoguePersonality(context.botId);
  if (!personality) return null;
  const candidates = personality.presets.filter((preset) => preset.eventTypes.includes(context.event.type));
  let pool = candidates.flatMap((preset) =>
    context.profanityEnabled ? [...preset.clean, ...preset.spicy] : [...preset.clean],
  );
  if (context.event.type === "HUMAN_MESSAGE_TO_BOT") {
    const fallback = HUMAN_MESSAGE_FALLBACKS[context.botId];
    pool = context.profanityEnabled ? [...fallback.clean, ...fallback.spicy] : [...fallback.clean];
  }
  const rendered = pool.map((line) => renderPreset(line, context.event));
  const fresh = rendered.filter((line) => !dialogueLineTooSimilar(line, context.recentBanter));
  if (fresh.length === 0) return null;
  return fresh[Math.floor(random() * fresh.length)] ?? fresh[0]!;
}

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;
const MARKDOWN_PATTERN = /(?:```|`{1,3}|\*\*|__|^\s*[-#>]\s)/m;
const CODE_PATTERN = /(?:function\s*\(|=>|console\.|<\/?[a-z][^>]*>)/i;
const MODEL_SELF_REFERENCE = /\b(?:gemini|grok|xai|openai|anthropic|language model|μοντέλο ai|τεχνητή νοημοσύνη)\b/i;
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

export function buildDialoguePrompt(context: DialogueGenerationContext): string {
  const recent = context.recentBanter.slice(-RECENT_BANTER_LIMIT).map((line) => `- ${line}`).join("\n") || "- none";
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
    context.profanityEnabled && context.intensity === "chaos"
      ? "STYLE: This is a private adult-friends card table. Speak exactly like a real close-knit Greek παρέα playing cards: spontaneous, blunt, colloquial, short and funny. Strong everyday swearing and crude table-trash-talk are welcome when they fit the personality and moment, including expressions such as «άντε γαμήσου», «τι λες ρε μαλάκα;», «τι σκατά έπαιξες;», «είσαι για τον πούτσο» and similar natural Greek phrasing. Do not sound polite, corporate, therapeutic, sanitized, or like an AI assistant. Avoid canned acknowledgements, repeated openings, repeated insults and generic one-liners; react to the actual public event or message. Keep each bot's own personality distinct. Never turn playful banter into a genuine threat of physical violence, sexual coercion/assault, hate/slurs, or targeted abuse outside the game. If replying to HUMAN_MESSAGE_TO_BOT, answer the actual human message directly and in-character."
      : context.profanityEnabled
        ? "STYLE: Natural Greek table banter with occasional strong colloquial swearing when it fits the personality. No genuine violence threats, sexual coercion/assault, hate/slurs, or gameplay advice."
        : "STYLE: Keep the banter natural for this personality and intensity, without profanity.",
    `PUBLIC_EVENT: ${event}`,
    "RECENT_BANTER_AS_DATA:",
    recent,
    "ANTI_REPETITION: Do not reuse a recent opening, punchline, insult, sentence pattern or near-identical wording. React freshly to this event in this bot's own voice. If HUMAN_MESSAGE_TO_BOT, answer what the human actually said instead of giving a generic acknowledgement.",
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
    recentBanter: context.recentBanter.slice(-RECENT_BANTER_LIMIT),
  };
}
