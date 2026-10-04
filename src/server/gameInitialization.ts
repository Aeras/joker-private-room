import type { SeatIndex } from "@/domain/dealing";
import {
  initializeCanonicalGameState,
  type InitialSeatInput,
} from "@/domain/gameInitialization";
import type { SeatOwner } from "@/domain/gameState";
import {
  loadCanonicalGameState,
  loadGameBootstrap,
  persistCanonicalGameState,
  type GameBootstrapParticipant,
  type GameStateFailureCode,
} from "@/server/gamePersistence";

export type InitializeProductionGameResult =
  | { ok: true; gameId: string; stateVersion: number; alreadyInitialized: boolean }
  | { ok: false; code: GameStateFailureCode };

function secureRandomUnit(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}

function participantOwner(participant: GameBootstrapParticipant): SeatOwner | null {
  if (participant.owner_type === "human") {
    return participant.player_id ? { type: "human", playerId: participant.player_id } : null;
  }

  if (
    !participant.bot_id ||
    !participant.bot_display_name ||
    !participant.bot_personality_id ||
    !participant.bot_strategy_profile_id ||
    !participant.bot_catalog_version
  ) {
    return null;
  }

  return {
    type: "bot",
    botId: participant.bot_id,
    displayName: participant.bot_display_name,
    personalityId: participant.bot_personality_id,
    strategyProfileId: participant.bot_strategy_profile_id,
    catalogVersion: participant.bot_catalog_version,
  };
}

function bootstrapSeats(
  participants: GameBootstrapParticipant[],
): [InitialSeatInput, InitialSeatInput, InitialSeatInput, InitialSeatInput] | null {
  if (participants.length !== 4) return null;
  const seats: InitialSeatInput[] = [];

  for (let index = 0; index < 4; index += 1) {
    const participant = participants.find((item) => item.seat_index === index);
    if (!participant || participant.status !== "active") return null;
    const owner = participantOwner(participant);
    if (!owner) return null;
    seats.push({
      seatIndex: index as SeatIndex,
      owner,
      connected: owner.type === "human",
    });
  }

  return seats as [InitialSeatInput, InitialSeatInput, InitialSeatInput, InitialSeatInput];
}

/**
 * Initializes a Start-created game shell exactly once. Secure shuffles are
 * produced in trusted server code. Concurrent initializers race only through
 * the existing state-version CAS; losers reload the committed winner.
 */
export async function ensureCanonicalGameInitialized(
  gameId: string,
): Promise<InitializeProductionGameResult> {
  const loaded = await loadCanonicalGameState(gameId);
  if (loaded.ok) {
    return {
      ok: true,
      gameId,
      stateVersion: loaded.stateVersion,
      alreadyInitialized: true,
    };
  }
  if (loaded.code !== "GAME_STATE_NOT_INITIALIZED") return { ok: false, code: loaded.code };

  const bootstrap = await loadGameBootstrap(gameId);
  if (!bootstrap.ok) {
    if (bootstrap.code === "GAME_ALREADY_INITIALIZED") {
      const winner = await loadCanonicalGameState(gameId);
      if (winner.ok) {
        return {
          ok: true,
          gameId,
          stateVersion: winner.stateVersion,
          alreadyInitialized: true,
        };
      }
    }
    return { ok: false, code: bootstrap.code };
  }
  if (
    bootstrap.rulesetId !== "popular" ||
    bootstrap.rulesVersion !== "popular-v1" ||
    bootstrap.stateSchemaVersion !== 1 ||
    bootstrap.stateVersion !== 0 ||
    bootstrap.lifecycle !== "starting"
  ) {
    return { ok: false, code: "INVALID_CANONICAL_STATE" };
  }

  const seats = bootstrapSeats(bootstrap.participants);
  if (!seats) return { ok: false, code: "INVALID_CANONICAL_STATE" };

  const state = initializeCanonicalGameState({
    gameId,
    roomId: bootstrap.roomId,
    seats,
    random: secureRandomUnit,
    serverNow: new Date().toISOString(),
  });

  const persisted = await persistCanonicalGameState({
    gameId,
    actionId: crypto.randomUUID(),
    commandType: "initialize_game",
    expectedStateVersion: 0,
    commandPayload: {
      roomId: bootstrap.roomId,
      roster: seats.map((seat) =>
        seat.owner.type === "human"
          ? { seatIndex: seat.seatIndex, type: "human", playerId: seat.owner.playerId }
          : {
              seatIndex: seat.seatIndex,
              type: "bot",
              botId: seat.owner.botId,
              strategyProfileId: seat.owner.strategyProfileId,
              catalogVersion: seat.owner.catalogVersion,
            },
      ),
    },
    newState: state,
  });

  if (persisted.ok) {
    return {
      ok: true,
      gameId,
      stateVersion: persisted.stateVersion,
      alreadyInitialized: false,
    };
  }

  if (persisted.code === "STALE_STATE" || persisted.code === "ACTION_ID_CONFLICT") {
    const winner = await loadCanonicalGameState(gameId);
    if (winner.ok) {
      return {
        ok: true,
        gameId,
        stateVersion: winner.stateVersion,
        alreadyInitialized: true,
      };
    }
  }

  return { ok: false, code: persisted.code };
}
