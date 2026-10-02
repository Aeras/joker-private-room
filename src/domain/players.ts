/** Player, seat and room domain types (backend-agnostic). */
import type { RulesetId } from "./rulesets";

export type PlayerRole = "host" | "player";

/** Public identity. Never contains PINs or secrets. */
export interface PublicPlayer {
  id: string;
  displayName: string;
  role: PlayerRole;
  avatarUrl?: string;
}

export interface BotIdentity {
  id: string;
  displayName: string;
  personalityId: string;
  avatarUrl?: string;
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
  botsTalk: boolean;
  /** Only meaningful when botsTalk is true. Never affects play strength/rules. */
  allowProfanity: boolean;
}

export type RoomStatus = "lobby" | "playing";

export interface Room {
  code: string;
  hostId: string;
  rulesetId: RulesetId;
  botSettings: BotSettings;
  seats: Seat[];
  status: RoomStatus;
}

export const occupantName = (o: SeatOccupant): string | null =>
  o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : null;
