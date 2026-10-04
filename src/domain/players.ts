/** Player, seat and room domain types (backend-agnostic). */
import type { DialogueIntensity } from "./dialoguePolicy";
import type { RulesetId } from "./rulesets";

export type PlayerRole = "host" | "player";

/** Public identity. Never contains PINs or secrets. */
export interface PublicPlayer {
  id: string;
  displayName: string;
  role: PlayerRole;
  avatarUrl?: string;
}

export type BotStrengthTier = 1 | 2 | 3;

export interface BotIdentity {
  id: string;
  displayName: string;
  personalityId: string;
  avatarUrl?: string;
  /** Immutable/versioned strategy snapshot for permanent production bots. */
  strategyProfileId?: string;
  /** Immutable catalog version pinned when the permanent bot is assigned. */
  catalogVersion?: string;
}

export interface PublicBotDefinition {
  id: string;
  displayName: string;
  avatarUrl: string;
  tier: BotStrengthTier;
  strategyProfileId: string;
  available: boolean;
}

export interface PublicBotCatalog {
  version: string;
  rulesVersion: string;
  bots: PublicBotDefinition[];
}

export type SeatOccupant =
  | { type: "empty" }
  | { type: "human"; player: PublicPlayer; connected: boolean }
  | { type: "bot"; bot: BotIdentity };

export interface Seat {
  index: number;
  occupant: SeatOccupant;
}

export interface BotSettings {
  /** Legacy field name retained for room wire compatibility; this is the speech master gate. */
  botsTalk: boolean;
  /** Only meaningful when botsTalk is true. Never affects play strength/rules. */
  allowProfanity: boolean;
  /** Optional external-AI dialogue path; false means preset-only dialogue. */
  aiEnabled: boolean;
  /** Presentation frequency only; never a bot strategy input. */
  intensity: DialogueIntensity;
}

export type RoomStatus = "lobby" | "playing";

export interface Room {
  code: string;
  hostId: string;
  rulesetId: RulesetId;
  /** Viewer-safe server label, including restricted host presentation. */
  rulesetName?: string;
  botSettings: BotSettings;
  seats: Seat[];
  status: RoomStatus;
  /** Monotonic server-side room version used for polling/reconciliation. */
  version?: number;
  /** Present after authoritative Start Game creates the game shell. */
  gameId?: string | null;
  /** Durable catalog reference persisted with the room. */
  botCatalogVersion?: string;
  /** Sanitized catalog projection added by the trusted room-command boundary. */
  botCatalog?: PublicBotCatalog;
}

export const occupantName = (o: SeatOccupant): string | null =>
  o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : null;
