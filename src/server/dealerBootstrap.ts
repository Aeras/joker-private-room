import type { SeatIndex } from "@/domain/dealing";
import {
  createInitialDealerBootstrapState,
  resolveDealerBootstrapAndInitializeDealOne,
  type InitialSeatInput,
} from "@/domain/dealerBootstrap";
import type { SeatOwner } from "@/domain/gameState";
import {
  loadCanonicalGameState,
  loadGameBootstrap,
  persistCanonicalGameState,
  type GameBootstrapParticipant,
  type GameStateFailureCode,
} from "@/server/gamePersistence";
import {
  deterministicRandomUnits,
  randomIterator,
  stableInternalActionId,
} from "@/server/internalDeterminism";

export type DealerBootstrapResult =
  | { ok: true; gameId: string; stateVersion: number; selectedDealerSeat: SeatIndex; replayed: boolean }
  | { ok: false; code: GameStateFailureCode };

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

async function loadResolvedWinner(gameId: string): Promise<DealerBootstrapResult | null> {
  const loaded = await loadCanonicalGameState(gameId);
  if (!loaded.ok) return null;
  const selection = loaded.canonicalState.initialDealerSelection;
  if (!selection || selection.status !== "resolved") return null;
  return {
    ok: true,
    gameId,
    stateVersion: loaded.stateVersion,
    selectedDealerSeat: selection.selectedDealerSeat,
    replayed: true,
  };
}

/**
 * Ensures exactly one canonical initial-dealer result. All identities and
 * randomness are server-owned and stable from the server-generated game UUID.
 */
export async function ensureInitialDealerBootstrap(gameId: string): Promise<DealerBootstrapResult> {
  const existing = await loadCanonicalGameState(gameId);
  if (existing.ok) {
    const selection = existing.canonicalState.initialDealerSelection;
    if (selection?.status === "resolved") {
      return {
        ok: true,
        gameId,
        stateVersion: existing.stateVersion,
        selectedDealerSeat: selection.selectedDealerSeat,
        replayed: true,
      };
    }
  } else if (existing.code !== "GAME_STATE_NOT_INITIALIZED") {
    return { ok: false, code: existing.code };
  }

  const bootstrapActionId = await stableInternalActionId(gameId, "initial-dealer-bootstrap-v1");
  const initActionId = await stableInternalActionId(gameId, "canonical-bootstrap-init-v1");

  let pendingState = existing.ok ? existing.canonicalState : null;
  if (!pendingState) {
    const bootstrap = await loadGameBootstrap(gameId);
    if (!bootstrap.ok) {
      if (bootstrap.code === "GAME_ALREADY_INITIALIZED") {
        const winner = await loadResolvedWinner(gameId);
        if (winner) return winner;
      }
      return { ok: false, code: bootstrap.code };
    }
    if (
      bootstrap.rulesetId !== "popular" ||
      bootstrap.rulesVersion !== "popular-v1" ||
      bootstrap.stateSchemaVersion !== 2 ||
      bootstrap.stateVersion !== 0 ||
      bootstrap.lifecycle !== "starting"
    ) {
      return { ok: false, code: "INVALID_CANONICAL_STATE" };
    }
    const seats = bootstrapSeats(bootstrap.participants);
    if (!seats) return { ok: false, code: "INVALID_CANONICAL_STATE" };

    pendingState = createInitialDealerBootstrapState({
      gameId,
      roomId: bootstrap.roomId,
      bootstrapActionId,
      seats,
    });

    const initialized = await persistCanonicalGameState({
      gameId,
      actionId: initActionId,
      commandType: "initialize_dealer_bootstrap",
      expectedStateVersion: 0,
      commandPayload: {
        bootstrapActionId,
        roster: seats.map((seat) =>
          seat.owner.type === "human"
            ? { seatIndex: seat.seatIndex, type: "human", playerId: seat.owner.playerId }
            : { seatIndex: seat.seatIndex, type: "bot", botId: seat.owner.botId },
        ),
      },
      newState: pendingState,
    });

    if (!initialized.ok) {
      if (initialized.code !== "STALE_STATE" && initialized.code !== "ACTION_ID_CONFLICT") {
        return { ok: false, code: initialized.code };
      }
      const reloaded = await loadCanonicalGameState(gameId);
      if (!reloaded.ok) return { ok: false, code: reloaded.code };
      pendingState = reloaded.canonicalState;
    }
  }

  const existingSelection = pendingState.initialDealerSelection;
  if (!existingSelection) return { ok: false, code: "INVALID_CANONICAL_STATE" };
  if (existingSelection.status === "resolved") {
    return {
      ok: true,
      gameId,
      stateVersion: pendingState.stateVersion,
      selectedDealerSeat: existingSelection.selectedDealerSeat,
      replayed: true,
    };
  }
  if (
    pendingState.lifecycle !== "starting" ||
    pendingState.progression.phase !== "INITIAL_DEALER_SELECTION" ||
    existingSelection.bootstrapActionId !== bootstrapActionId
  ) {
    return { ok: false, code: "INVALID_CANONICAL_STATE" };
  }

  const [recipientUnits, selectionUnits, dealUnits] = await Promise.all([
    deterministicRandomUnits(gameId, "dealer-first-recipient-v1", 1),
    deterministicRandomUnits(gameId, "dealer-selection-shuffle-v1", 35),
    deterministicRandomUnits(gameId, "deal-one-shuffle-v1", 35),
  ]);
  const resolved = resolveDealerBootstrapAndInitializeDealOne({
    state: pendingState,
    firstRecipientRandom: randomIterator(recipientUnits),
    selectionShuffleRandom: randomIterator(selectionUnits),
    dealOneShuffleRandom: randomIterator(dealUnits),
    serverNow: new Date().toISOString(),
  });
  const selection = resolved.initialDealerSelection;
  if (!selection || selection.status !== "resolved") {
    return { ok: false, code: "INVALID_CANONICAL_STATE" };
  }

  const persisted = await persistCanonicalGameState({
    gameId,
    actionId: bootstrapActionId,
    commandType: "resolve_initial_dealer",
    expectedStateVersion: pendingState.stateVersion,
    commandPayload: {
      firstRecipientSeat: selection.firstRecipientSeat,
      revealedCardIds: selection.revealedSelectionCards.map((card) => card.id),
      selectedDealerSeat: selection.selectedDealerSeat,
    },
    newState: resolved,
  });

  if (!persisted.ok) {
    if (persisted.code === "STALE_STATE" || persisted.code === "ACTION_ID_CONFLICT") {
      const winner = await loadResolvedWinner(gameId);
      if (winner) return winner;
    }
    return { ok: false, code: persisted.code };
  }

  return {
    ok: true,
    gameId,
    stateVersion: persisted.stateVersion,
    selectedDealerSeat: selection.selectedDealerSeat,
    replayed: persisted.replayed,
  };
}
