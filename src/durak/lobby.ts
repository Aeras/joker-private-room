import { PLAYER_COUNTS, type DurakVariant } from "./rules";

/** Pure DURAK lobby model: never mix with JOKER's four-seat Room. */
export type DurakSeat = { index: number; occupant: "human" | "bot" | "empty"; name: string | null };
export type DurakLobby = {
  game: "durak";
  variant: DurakVariant;
  capacity: number;
  seats: DurakSeat[];
};
export function createDurakLobbyPreview(hostName: string, variant: DurakVariant, capacity: number): DurakLobby {
  if (!(PLAYER_COUNTS as readonly number[]).includes(capacity)) throw new Error("Invalid DURAK capacity");
  const seats: DurakSeat[] = Array.from({ length: capacity }, (_, index) => ({
    index,
    occupant: index === 0 ? "human" : "empty",
    name: index === 0 ? hostName : null,
  }));
  return { game: "durak", variant, capacity, seats };
}
export function previewAssignBot(lobby: DurakLobby, seatIndex: number, botName: string): DurakLobby {
  if (lobby.game !== "durak" || !botName.trim() || !lobby.seats.some(seat => seat.index === seatIndex && seat.occupant !== "human")) {
    throw new Error("Invalid bot assignment");
  }
  if (lobby.seats.some(seat => seat.occupant === "bot" && seat.name === botName && seat.index !== seatIndex)) {
    throw new Error("Duplicate bot");
  }
  return { ...lobby, seats: lobby.seats.map(seat => seat.index === seatIndex ? { ...seat, occupant: "bot", name: botName } : seat) };
}
export function previewRemoveBot(lobby: DurakLobby, seatIndex: number): DurakLobby {
  if (!lobby.seats.some(seat => seat.index === seatIndex && seat.occupant === "bot")) throw new Error("No bot");
  return { ...lobby, seats: lobby.seats.map(seat => seat.index === seatIndex ? { ...seat, occupant: "empty", name: null } : seat) };
}
