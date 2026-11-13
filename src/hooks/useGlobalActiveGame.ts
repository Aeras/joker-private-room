import { useCallback, useEffect, useState } from "react";
import { getCurrentActiveGame, getCurrentRoomMembership, leaveWaitingRoom } from "@/services/roomFunctions";
import { durakRoomCommand } from "@/services/durakRoomFunctions";
import { biribaCommand } from "@/services/biribaFunctions";
import { getProjectedGameState, terminateProjectedGame } from "@/services/gameProjectionFunctions";

export type ActiveGameInfo = {
  game: "joker" | "durak" | "biriba";
  gameTitle: string;
  roomCode: string;
  lifecycle: "waiting" | "playing";
  returnUrl: string;
  gameId?: string;
  stateVersion?: number;
};

export type GlobalActiveGameState = {
  loading: boolean;
  active: ActiveGameInfo | null;
  refresh: () => Promise<ActiveGameInfo | null>;
  leave: () => Promise<boolean>;
};

export function useGlobalActiveGame(): GlobalActiveGameState {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveGameInfo | null>(null);

  const refresh = useCallback(async (): Promise<ActiveGameInfo | null> => {
    setLoading(true);
    try {
      const [jokerActive, jokerMembership, durakRes, biribaRes] = await Promise.allSettled([
        getCurrentActiveGame(),
        getCurrentRoomMembership(),
        durakRoomCommand({ data: { action: "membership" } }),
        biribaCommand({ data: { action: "membership" } }),
      ]);

      // 1. Joker active in-progress match
      if (jokerActive.status === "fulfilled" && jokerActive.value.ok && jokerActive.value.activeGame) {
        const ag = jokerActive.value.activeGame;
        const info: ActiveGameInfo = {
          game: "joker",
          gameTitle: "JOKER",
          roomCode: ag.roomCode,
          lifecycle: "playing",
          returnUrl: `/table?code=${ag.roomCode}&gameId=${ag.gameId}`,
          gameId: ag.gameId,
          stateVersion: typeof ag.stateVersion === "number" ? ag.stateVersion : undefined,
        };
        setActive(info);
        setLoading(false);
        return info;
      }

      // 2. Joker waiting lobby
      if (
        jokerMembership.status === "fulfilled" &&
        jokerMembership.value.ok &&
        jokerMembership.value.membership?.lifecycle === "lobby"
      ) {
        const code = jokerMembership.value.membership.code;
        const info: ActiveGameInfo = {
          game: "joker",
          gameTitle: "JOKER",
          roomCode: code,
          lifecycle: "waiting",
          returnUrl: `/lobby?code=${code}`,
        };
        setActive(info);
        setLoading(false);
        return info;
      }

      // 3. Durak active or waiting
      if (
        durakRes.status === "fulfilled" &&
        durakRes.value.ok &&
        "membership" in durakRes.value &&
        durakRes.value.membership
      ) {
        const m = durakRes.value.membership;
        const info: ActiveGameInfo = {
          game: "durak",
          gameTitle: "DURAK",
          roomCode: m.code,
          lifecycle: m.lifecycle === "playing" ? "playing" : "waiting",
          returnUrl: "/durak",
        };
        setActive(info);
        setLoading(false);
        return info;
      }

      // 4. Biriba active or waiting
      if (
        biribaRes.status === "fulfilled" &&
        biribaRes.value.ok &&
        "membership" in biribaRes.value &&
        biribaRes.value.membership
      ) {
        const m = biribaRes.value.membership;
        const info: ActiveGameInfo = {
          game: "biriba",
          gameTitle: "ΜΠΙΡΙΜΠΑ",
          roomCode: m.code,
          lifecycle: m.lifecycle === "playing" ? "playing" : "waiting",
          returnUrl: "/biriba",
        };
        setActive(info);
        setLoading(false);
        return info;
      }

      setActive(null);
      setLoading(false);
      return null;
    } catch {
      setActive(null);
      setLoading(false);
      return null;
    }
  }, []);

  const leave = useCallback(async (): Promise<boolean> => {
    if (!active) return false;
    setLoading(true);
    try {
      if (active.game === "biriba") {
        await biribaCommand({ data: { action: "leave", code: active.roomCode } });
      } else if (active.game === "durak") {
        await durakRoomCommand({ data: { action: "leave", code: active.roomCode } });
      } else if (active.game === "joker") {
        if (active.lifecycle === "waiting") {
          await leaveWaitingRoom({ data: { code: active.roomCode } });
        } else if (active.gameId) {
          let version = typeof active.stateVersion === "number" ? active.stateVersion : 0;
          if (version === 0) {
            try {
              const stateRes = await getProjectedGameState({ data: { gameId: active.gameId } });
              if (stateRes.ok && stateRes.projection) {
                version = stateRes.projection.stateVersion;
              }
            } catch {
              // fallback
            }
          }
          const termRes = await terminateProjectedGame({
            data: {
              gameId: active.gameId,
              actionId: crypto.randomUUID(),
              expectedStateVersion: version,
            },
          });
          if (!termRes.ok && termRes.code === "STALE_STATE" && typeof termRes.currentStateVersion === "number") {
            await terminateProjectedGame({
              data: {
                gameId: active.gameId,
                actionId: crypto.randomUUID(),
                expectedStateVersion: termRes.currentStateVersion,
              },
            });
          }
          try {
            await leaveWaitingRoom({ data: { code: active.roomCode } });
          } catch {
            // Room might already be deleted
          }
        }
      }
      await refresh();
      return true;
    } catch {
      await refresh();
      return false;
    }
  }, [active, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, active, refresh, leave };
}
