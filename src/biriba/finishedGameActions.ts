import type { BiribaResponse, BiribaRoomView } from "@/services/biribaFunctions";

type Command = (request: {
  data: {
    action: "end_game" | "create";
    code?: string;
    capacity?: 2 | 4;
    target?: 1000 | 2000 | 5000 | 10000;
    timerEnabled?: boolean;
  };
}) => Promise<BiribaResponse>;

/** A fresh room contains only its creator; prior players must choose to join. */
export async function createAfterFinishedGame(
  room: BiribaRoomView,
  command: Command,
): Promise<BiribaResponse> {
  const ended = await command({ data: { action: "end_game", code: room.code } });
  if (!ended.ok) return ended;
  return command({
    data: {
      action: "create",
      capacity: room.capacity,
      target: room.target,
      timerEnabled: room.timerEnabled,
    },
  });
}
