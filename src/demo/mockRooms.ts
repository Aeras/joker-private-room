/**
 * DEMO ONLY. Local mock room service. Room codes, seats and bot filling are
 * generated client-side here purely for exploration.
 */
import { SEAT_COUNT } from "@/domain/gameConfig";
import type { PublicPlayer, Room, Seat } from "@/domain/players";
import type { RoomService } from "@/services/rooms";
import { CANONICAL_BOTS } from "../../supabase/functions/_shared/bot-catalog";
import { DEMO_HOST } from "./mockIdentity";
import { demoStore } from "./store";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateDemoRoomCode(): string {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
}

const emptySeats = (): Seat[] =>
  Array.from({ length: SEAT_COUNT }, (_, index) => ({ index, occupant: { type: "empty" } }));

function seatPlayer(room: Room, player: PublicPlayer): Room {
  if (room.seats.some((s) => s.occupant.type === "human" && s.occupant.player.id === player.id)) return room;
  const idx = room.seats.findIndex((s) => s.occupant.type === "empty");
  if (idx < 0) return room;
  const seats = room.seats.map((s, i) =>
    i === idx ? { ...s, occupant: { type: "human" as const, player, connected: true } } : s,
  );
  return { ...room, seats };
}

export const mockRoomService: RoomService = {
  async createRoom({ host, rulesetId, botSettings }) {
    let room: Room = {
      code: generateDemoRoomCode(),
      hostId: host.id,
      rulesetId,
      botSettings,
      seats: emptySeats(),
      status: "lobby",
    };
    // Only the host is present initially. Every other seat remains genuinely
    // empty until another human joins; startGame fills only what is still empty.
    room = seatPlayer(room, host);
    demoStore.set({ room, localPlayer: host });
    return room;
  },

  async joinRoom(code, player) {
    const normalized = code.trim().toUpperCase();
    const existing = demoStore.get().room;
    let room: Room =
      existing && existing.code === normalized && existing.status === "lobby"
        ? existing
        : {
            code: normalized,
            hostId: DEMO_HOST.id,
            rulesetId: "popular",
            botSettings: {
              botsTalk: true,
              allowProfanity: false,
              aiEnabled: false,
              intensity: "normal",
            },
            seats: emptySeats(),
            status: "lobby",
          };
    if (player.id !== DEMO_HOST.id) room = seatPlayer(room, DEMO_HOST);
    room = seatPlayer(room, player);
    demoStore.set({ room, localPlayer: player });
    return room;
  },

  async startGame(code) {
    const room = demoStore.get().room;
    if (!room || room.code !== code) throw new Error("Room not found");
    let botN = 0;
    const seats = room.seats.map((s) => {
      if (s.occupant.type !== "empty") return s;
      const bot = CANONICAL_BOTS[botN++ % CANONICAL_BOTS.length]!;
      return {
        ...s,
        occupant: {
          type: "bot" as const,
          bot: {
            id: bot.id,
            displayName: bot.displayName,
            avatarUrl: bot.avatarUrl,
            personalityId: bot.personalityId,
            strategyProfileId: bot.strategyProfileId,
            catalogVersion: bot.catalogVersion,
          },
        },
      };
    });
    const next: Room = { ...room, seats, status: "playing" };
    demoStore.set({ room: next });
    return next;
  },
};
