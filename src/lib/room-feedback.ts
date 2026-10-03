import { t } from "@/i18n/el";
import type { RoomCommandResult } from "@/services/roomFunctions";

export function roomFailureMessage(result: Extract<RoomCommandResult, { ok: false }>): string {
  switch (result.code) {
    case "ROOM_NOT_FOUND":
      return t.roomNotFound;
    case "ROOM_FULL":
      return t.roomFull;
    case "ROOM_ALREADY_STARTED":
      return t.roomAlreadyStarted;
    case "ACTIVE_GAME_EXISTS":
      return t.activeGameExists;
    case "RULESET_NOT_IMPLEMENTED":
      return t.rulesetNotImplemented;
    case "NOT_HOST":
      return t.hostOnly;
    default:
      return t.roomUnavailable;
  }
}
