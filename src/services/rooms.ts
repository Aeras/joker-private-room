/** Room/lobby service abstraction. Production: backend-generated rooms. */
import type { BotSettings, PublicPlayer, Room } from "@/domain/players";
import type { RulesetId } from "@/domain/rulesets";

export interface CreateRoomInput {
  host: PublicPlayer;
  rulesetId: RulesetId;
  botSettings: BotSettings;
}

export interface RoomService {
  createRoom(input: CreateRoomInput): Promise<Room>;
  joinRoom(code: string, player: PublicPlayer): Promise<Room | null>;
  /** Fills empty seats with bots and moves the room to "playing". Host only. */
  startGame(code: string, requesterId: string): Promise<Room>;
}

export const roomInviteUrl = (code: string) =>
  typeof window === "undefined" ? `/join?code=${code}` : `${window.location.origin}/join?code=${code}`;
