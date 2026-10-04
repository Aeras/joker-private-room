import { useCallback, useEffect, useState } from "react";
import {
  getCurrentActiveGame,
  type ActiveGameSummary,
  type CurrentActiveGameResult,
} from "@/services/roomFunctions";

export type ActiveGameLookupState =
  | { status: "loading"; activeGame: null }
  | { status: "none"; activeGame: null }
  | { status: "unauthenticated"; activeGame: null }
  | { status: "error"; activeGame: null }
  | { status: "active"; activeGame: ActiveGameSummary };

export function useCurrentActiveGame() {
  const [state, setState] = useState<ActiveGameLookupState>({ status: "loading", activeGame: null });

  const refresh = useCallback(async (): Promise<CurrentActiveGameResult> => {
    try {
      const result = await getCurrentActiveGame();
      if (result.ok) {
        setState(result.activeGame
          ? { status: "active", activeGame: result.activeGame }
          : { status: "none", activeGame: null });
      } else if (result.code === "NOT_AUTHENTICATED") {
        setState({ status: "unauthenticated", activeGame: null });
      } else {
        setState({ status: "error", activeGame: null });
      }
      return result;
    } catch {
      const result = { ok: false, code: "SERVICE_UNAVAILABLE" } as const;
      setState({ status: "error", activeGame: null });
      return result;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
