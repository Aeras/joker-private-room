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

export interface DialogueTableParticipant {
  seat: number;
  kind: "human" | "bot";
  displayName: string;
  botId?: CanonicalDialogueBotId;
}

export interface DialogueGenerationContext {
  botId: CanonicalDialogueBotId;
  botDisplayName: string;
  personality: string;
  event: PublicDialogueEvent;
  profanityEnabled: boolean;
  intensity: DialogueIntensity;
  recentBanter: readonly string[];
  tableParticipants?: readonly DialogueTableParticipant[];
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

// Curated friends-only phrases. The canonical table roster is mandatory for addressed lines.
// Event-based rules use public observations only; never infer concealed hands.
const SHARED_CLEAN_LINES = [
  "Ρε παιδιά, πού είναι όλα τα Τζόκερ σήμερα; Τα κρύβετε σπίτι σας;",
  "Εγώ σήμερα δεν παίζω χαρτιά, κάνω συλλογή από σαβούρα.",
  "{target}, άσε και καμιά μπάζα για μας, μη γίνεσαι μοναχοφάης!",
  "Κάποιος εδώ μέσα έχει μαζέψει όλη την τράπουλα και κάνει τον ανήξερο.",
  "Πάλι τα ίδια φύλλα; Ρε συ, ανακάτεψε λίγο, δεν θα παρεξηγηθούμε!",
  "Αν συνεχίσω έτσι, στο τέλος θα χρωστάω και πόντους από αύριο.",
  "{target}, πολύ ήσυχος είσαι σήμερα. Τι ετοιμάζεις εκεί πέρα;",
  "Άμα δεν μου κάτσει κανένα καλό φύλλο, θα αρχίσω να παίζω με ανοιχτά χαρτιά από τα νεύρα μου.",
  "Ωραία, ωραία... Όλοι μάγκες με καλά φύλλα είστε!",
  "Παιδιά, αν δείτε πουθενά την τύχη μου, πείτε της ότι την ψάχνω.",
] as const;

const JOKER_COMPLAINTS = [
  "Ρε παιδιά, πού πήγαν όλα τα Τζόκερ;",
  "Πάλι χωρίς Τζόκερ; Κάποιος με δουλεύει εδώ μέσα!",
  "Ρε {target}, όλα τα Τζόκερ σε σένα έρχονται;",
  "Άμα δείτε κανένα Τζόκερ, στείλτε το από δω!",
] as const;

const SHARED_SPICY_LINES = [
  "Τώρα, τώρα θα σας γαμήσω όλους!",
  "Είσαι μεγάλη πουτάνα!",
  "Τι κωλόχαρτα είναι αυτά, μη σας γαμήσω όλους!",
  "Όταν γαμιέσαι, κουνιέσαι;",
] as const;

const MONIKA_CLEAN_LINES = [
  "Κάναμε όλες τις δουλειές και τώρα παίζουμε Τζόκερ!",
  "Όλη μέρα στο πόδι και τώρα ήρθα να σας κερδίσω κιόλας!",
  "Μαγείρεψα, καθάρισα, τώρα αφήστε με να παίξω λίγο!",
  "Επιτέλους κάθισα κι εγώ! Μη μου χαλάσετε τη διάθεση!",
  "Τόσες δουλειές έκανα σήμερα, ένα καλό φύλλο δεν δικαιούμαι;",
  "Άφησα τις δουλειές για να παίξω και μου δίνετε τέτοια χαρτιά;",
] as const;

function presentHuman(context: DialogueGenerationContext, displayName: string): DialogueTableParticipant | undefined {
  return context.tableParticipants?.find((p) =>
    p.kind === "human" && normalizeDialogueLine(p.displayName) === normalizeDialogueLine(displayName)
  );
}

function addressedTo(context: DialogueGenerationContext, name: string): boolean {
  const recipient = presentHuman(context, name);
  return recipient != null && context.event.targetSeat === recipient.seat;
}

function curatedCandidates(context: DialogueGenerationContext): string[] {
  const type = context.event.type;
  const hasNamedTarget = context.event.targetSeat != null &&
    context.tableParticipants?.some((p) => p.seat === context.event.targetSeat) === true;
  const result: string[] = [];
  if (["TRICK_WON", "ROUND_END", "GAME_END", "COMEBACK", "SCORE_COLLAPSE", "BOT_MISSED_BID", "BOT_GOT_MINUS_200"].includes(type)) {
    result.push(...SHARED_CLEAN_LINES.filter((line) => !line.includes("{target}") || hasNamedTarget));
    if (context.botId === "ka-monika") result.push(...MONIKA_CLEAN_LINES);
  }
  // Mere passage of deals does not prove an own-hand Joker drought.
  // Joker complaints must wait for an authoritative own-hand drought observation.
  void JOKER_COMPLAINTS;
  if (context.botId === "ka-monika" && addressedTo(context, "Ζωάλο Πουτς") &&
      ["TRICK_WON", "ROUND_END", "PLAYER_MISSED_BID"].includes(type)) {
    result.push("Με σένα δεν μπορούμε να συνεννοηθούμε, ίσως επειδή είσαι από άλλη χώρα!");
  }
  if (context.botId === "thomoulis" && addressedTo(context, "Τζαμανάς Δικώνετε") &&
      ["TRICK_WON", "ROUND_END", "PLAYER_MISSED_BID"].includes(type)) {
    result.push("Μιχάλη, δες λίγο τα mail που σου έστειλα.");
    result.push("Μιχάλη, πάμε να κόψουμε κάνα τιμολόγιο, μπας και πληρωθούμε.");
  }
  if (context.botId === "giorgos-nousios" && addressedTo(context, "Git") &&
      ["TRICK_WON", "ROUND_END", "PLAYER_HIT_EXACT_BID"].includes(type)) {
    result.push("Και ο κουνιστός θέλει να κερδίσει εμένα;");
  }
  if (context.profanityEnabled && ["TRICK_WON", "COMEBACK", "BOT_STOLE_CRITICAL_TRICK"].includes(type)) {
    result.push(SHARED_SPICY_LINES[0]);
  }
  if (context.profanityEnabled && ["BOT_MISSED_BID", "BOT_GOT_MINUS_200", "SCORE_COLLAPSE"].includes(type)) {
    result.push(SHARED_SPICY_LINES[2]);
  }
  if (context.profanityEnabled && hasNamedTarget &&
      ["PLAYER_STOLE_CRITICAL_TRICK", "PLAYER_MISSED_BID", "TRICK_WON"].includes(type)) {
    result.push(SHARED_SPICY_LINES[1], SHARED_SPICY_LINES[3]);
  }
  if (context.profanityEnabled && addressedTo(context, "Git") &&
      ["TRICK_WON", "PLAYER_MISSED_BID"].includes(type)) {
    result.push("Ελάτε να γαμήσουμε τον Παναγιώτη!");
  }
  return result;
}

const PERSONALITY_BY_ID = new Map(DIALOGUE_PERSONALITIES.map((personality) => [personality.id, personality] as const));

export function getDialoguePersonality(id: string): DialoguePersonality | null {
  return PERSONALITY_BY_ID.get(id as CanonicalDialogueBotId) ?? null;
}

function renderPreset(line: string, event: PublicDialogueEvent): string {
  return line.replaceAll("{target}", event.targetName ?? "φίλε");
}

export const RECENT_BANTER_LIMIT = 10;

const CHAOS_GENERIC_FALLBACKS: Record<CanonicalDialogueBotId, readonly string[]> = {
  "ka-monika": ["Άντε ρε μαλάκες, ξυπνήστε λίγο.", "Πάλι θα σας μαζεύω τα ασυμμάζευτα;", "Τι παρέα είστε εσείς ρε;", "Έλα, μη με κάνετε να βαριέμαι."],
  "giorgos-nousios": ["Ρε μαλάκες, χαρτιά παίζουμε ή κάνουμε συμβούλιο;", "Άντε, πολύ σας πήρε ο αέρας.", "Τι σκατά κάνετε πάλι;", "Εγώ φταίω που κάθομαι μαζί σας."],
  "theia-tamara": ["Παναγία μου, τι παρέα μαζεύτηκε πάλι.", "Άντε καλέ, θα με πεθάνετε σήμερα.", "Μη με τρελαίνετε άλλο, αρκετά.", "Αχ, πάλι θα γίνει χαμός εδώ μέσα."],
  "mounara": ["Άντε ρε, χαλαρώστε λίγο γιατί σας βλέπω πολύ άνετους.", "Μη χαίρεστε ακόμα, έχει δρόμο.", "Τι ωραία παρέα... για ψυχίατρο.", "Έλα αγάπες μου, ξυπνήστε."],
  "thomoulis": ["Ρε μαλάκες, εγώ πάντως ήρθα για την παρέα.", "Άντε, κάποιος να κάνει καμιά μαλακία να γελάσουμε.", "Εγώ γιατί νιώθω ότι θα φάω πάλι ξύλο;", "Καλά πάμε. Δηλαδή όχι, αλλά τέλος πάντων."],
  "archimandritis": ["Τέκνα μου, σήμερα η αμαρτία περισσεύει.", "Άντε τέκνα μου, μη με κάνετε να βλαστημήσω.", "Ο Κύριος να βάλει το χέρι του με την παρέα σας.", "Τέκνον μου, πολύ θάρρος πήρες σήμερα."],
};

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
  if (context.intensity === "chaos" && context.profanityEnabled) {
    pool = [...pool, ...CHAOS_GENERIC_FALLBACKS[context.botId]];
  }
  if (context.event.type === "HUMAN_MESSAGE_TO_BOT") {
    const fallback = HUMAN_MESSAGE_FALLBACKS[context.botId];
    pool = context.profanityEnabled ? [...fallback.clean, ...fallback.spicy] : [...fallback.clean];
  }
  // Occasionally introduce a curated line; preserve the normal dynamic personality flow.
  // A single roll avoids deterministic repetition and leaves recent-text filtering authoritative.
  if (random() > 0.72 && context.event.type !== "HUMAN_MESSAGE_TO_BOT" && context.event.type !== "BOT_MESSAGE_TO_BOT") {
    pool = [...pool, ...curatedCandidates(context)];
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
  const table = (context.tableParticipants ?? []).map((participant) => ({
    seat: participant.seat,
    kind: participant.kind,
    displayName: participant.displayName,
  }));
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
      ? "STYLE: This is a private adult-friends card table. Speak like real Greek friends hanging out, not like a commentator. Be spontaneous, blunt, colloquial, short and funny. Strong everyday swearing and crude friendly trash-talk are welcome when they fit the personality, including phrases like «άντε γαμήσου ρε μαλάκα», «τι σκατά λες;», «μη μας τα πρήζεις», «είσαι για τον πούτσο» and similarly natural Greek banter. Do not sanitize ordinary Greek swearing. You do NOT have to mention the exact trick, score or card event every time; you may riff on the mood, tease someone, mock the group, boast, complain, or throw a random friendly insult as people do in a real παρέα. Do not sound polite, corporate, therapeutic, scripted, game-announcer-like, or like an AI assistant. Avoid canned acknowledgements, repeated openings, repeated insults and generic one-liners. Keep each bot's own personality distinct. Never turn playful banter into a genuine threat of physical violence, sexual coercion/assault, hate/slurs, or targeted abuse outside the game. If replying to HUMAN_MESSAGE_TO_BOT, answer the actual human message directly and in-character."
      : context.profanityEnabled
        ? "STYLE: Natural Greek table banter with occasional strong colloquial swearing when it fits the personality. No genuine violence threats, sexual coercion/assault, hate/slurs, or gameplay advice."
        : "STYLE: Keep the banter natural for this personality and intensity, without profanity.",
    `CURRENT_TABLE: ${JSON.stringify(table)}`,
    "NAME_RULE: If you address or mention someone by name, use ONLY a displayName from CURRENT_TABLE. Never invent, remember, or use any other player/bot name.",
    `PUBLIC_EVENT: ${event}`,
    "RECENT_BANTER_AS_DATA:",
    recent,
    "ANTI_REPETITION: Do not reuse a recent opening, punchline, insult, sentence pattern or near-identical wording. React freshly to this event in this bot's own voice. If HUMAN_MESSAGE_TO_BOT, answer what the human actually said instead of giving a generic acknowledgement.",
    "Return only the spoken line, ideally 25–70 characters and never over 100. Use natural Greek punctuation so it sounds good when spoken aloud.",
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
    tableParticipants: (context.tableParticipants ?? []).map((participant) => ({
      seat: participant.seat,
      kind: participant.kind,
      displayName: participant.displayName,
      botId: participant.botId,
    })),
  };
}
