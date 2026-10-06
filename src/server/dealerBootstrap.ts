import { holdOrdinaryDealForPresentation } from "@/domain/dealPresentationBarrier";
import { getRuleset } from "@/domain/rulesets";
import { RESERVED_TARGET_ID } from "@/server/rulesetIdentity";
import type { SeatIndex } from "@/domain/dealing";
import {
  activateDealOneAfterPresentation,
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
  deterministicRandomUnitsFromSeed,
  randomIterator,
  secureServerEntropySeed,
  stableInternalActionId,
} from "@/server/internalDeterminism";

export type DealerBootstrapPreparationResult =
  | { ok: true; gameId: string; stateVersion: number; replayed: boolean }
  | { ok: false; code: GameStateFailureCode };

export type DealerBootstrapResult =
  | { ok: true; gameId: string; stateVersion: number; selectedDealerSeat: SeatIndex; replayed: boolean }
  | { ok: false; code: GameStateFailureCode };

export type StartPresentationActivationResult =
  | { ok: true; gameId: string; stateVersion: number; replayed: boolean }
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

/**
 * Lobby Start ends here. It creates only the canonical waiting state. It MUST NOT
 * select a dealer, deal cards, start a deadline, or run automatic gameplay.
 */
export async function ensureInitialDealerBootstrapPrepared(
  gameId: string,
): Promise<DealerBootstrapPreparationResult> {
  const existing = await loadCanonicalGameState(gameId);
  if (existing.ok) {
    return { ok: true, gameId, stateVersion: existing.stateVersion, replayed: true };
  }
  if (existing.code !== "GAME_STATE_NOT_INITIALIZED") return { ok: false, code: existing.code };

  const bootstrapActionId = await stableInternalActionId(gameId, "initial-dealer-bootstrap-v1");
  const initActionId = await stableInternalActionId(gameId, "canonical-bootstrap-init-v1");
  const bootstrap = await loadGameBootstrap(gameId);
  if (!bootstrap.ok) {
    if (bootstrap.code === "GAME_ALREADY_INITIALIZED") {
      const reloaded = await loadCanonicalGameState(gameId);
      if (reloaded.ok) return { ok: true, gameId, stateVersion: reloaded.stateVersion, replayed: true };
    }
    return { ok: false, code: bootstrap.code };
  }
  try { getRuleset(bootstrap.rulesetId, bootstrap.rulesVersion); }
  catch { return { ok: false, code: "INVALID_CANONICAL_STATE" }; }
  if (
    bootstrap.stateSchemaVersion !== 4 ||
    bootstrap.stateVersion !== 0 ||
    bootstrap.lifecycle !== "starting"
  ) return { ok: false, code: "INVALID_CANONICAL_STATE" };

  const seats = bootstrapSeats(bootstrap.participants);
  if (!seats) return { ok: false, code: "INVALID_CANONICAL_STATE" };

  const pendingState = createInitialDealerBootstrapState({
    gameId,
    roomId: bootstrap.roomId,
    rulesetId: bootstrap.rulesetId,
    rulesVersion: bootstrap.rulesVersion,
    targetPlayerId: RESERVED_TARGET_ID,
    bootstrapActionId,
    serverEntropySeed: secureServerEntropySeed(),
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
    if (initialized.code === "STALE_STATE" || initialized.code === "ACTION_ID_CONFLICT") {
      const reloaded = await loadCanonicalGameState(gameId);
      if (reloaded.ok) return { ok: true, gameId, stateVersion: reloaded.stateVersion, replayed: true };
    }
    return { ok: false, code: initialized.code };
  }

  return { ok: true, gameId, stateVersion: initialized.stateVersion, replayed: initialized.replayed };
}

/** Host Play calls this after the server has verified every human table is ready. */
export async function resolveInitialDealerBootstrap(gameId: string): Promise<DealerBootstrapResult> {
  const prepared = await ensureInitialDealerBootstrapPrepared(gameId);
  if (!prepared.ok) return prepared;

  const loaded = await loadCanonicalGameState(gameId);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  const pendingState = loaded.canonicalState;
  const existingSelection = pendingState.initialDealerSelection;
  if (!existingSelection || !pendingState.serverEntropySeed) return { ok: false, code: "INVALID_CANONICAL_STATE" };
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
    pendingState.progression.phase !== "INITIAL_DEALER_SELECTION"
  ) return { ok: false, code: "INVALID_CANONICAL_STATE" };

  const bootstrapActionId = existingSelection.bootstrapActionId;
  const entropySeed = pendingState.serverEntropySeed;
  const deckSize = getRuleset(pendingState.rulesetId, pendingState.rulesVersion).deckSize;
  const [recipientUnits, selectionUnits, dealUnits] = await Promise.all([
    deterministicRandomUnitsFromSeed(entropySeed, "dealer-first-recipient-v1", 1),
    deterministicRandomUnitsFromSeed(entropySeed, "dealer-selection-shuffle-v1", deckSize - 1),
    deterministicRandomUnitsFromSeed(entropySeed, "deal-1-shuffle-v1", deckSize - 1),
  ]);

  const resolved = resolveDealerBootstrapAndInitializeDealOne({
    state: pendingState,
    firstRecipientRandom: randomIterator(recipientUnits),
    selectionShuffleRandom: randomIterator(selectionUnits),
    dealOneShuffleRandom: randomIterator(dealUnits),
    serverNow: new Date().toISOString(),
  });
  const selection = resolved.initialDealerSelection;
  if (!selection || selection.status !== "resolved") return { ok: false, code: "INVALID_CANONICAL_STATE" };

  const persisted = await persistCanonicalGameState({
    gameId,
    actionId: bootstrapActionId,
    commandType: "resolve_initial_dealer",
    expectedStateVersion: pendingState.stateVersion,
    commandPayload: {
      firstRecipientSeat: selection.firstRecipientSeat,
      revealedCardIds: selection.revealedSelectionCards.map((card) => card.id),
      selectedDealerSeat: selection.selectedDealerSeat,
      presentationBarrier: "DEAL_SETUP",
    },
    newState: resolved,
  });
  if (!persisted.ok) {
    if (persisted.code === "STALE_STATE" || persisted.code === "ACTION_ID_CONFLICT") {
      const winner = await loadCanonicalGameState(gameId);
      const winnerSelection = winner.ok ? winner.canonicalState.initialDealerSelection : null;
      if (winner.ok && winnerSelection?.status === "resolved") {
        return {
          ok: true,
          gameId,
          stateVersion: winner.stateVersion,
          selectedDealerSeat: winnerSelection.selectedDealerSeat,
          replayed: true,
        };
      }
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

/** Last human presentation acknowledgement releases Deal 1 to real gameplay. */
export async function activateInitialDealAfterPresentation(
  gameId: string,
): Promise<StartPresentationActivationResult> {
  const loaded = await loadCanonicalGameState(gameId);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  if (loaded.canonicalState.lifecycle === "active") {
    return { ok: true, gameId, stateVersion: loaded.stateVersion, replayed: true };
  }
  if (
    loaded.canonicalState.lifecycle !== "starting" ||
    loaded.canonicalState.progression.phase !== "DEAL_SETUP"
  ) return { ok: false, code: "INVALID_CANONICAL_STATE" };

  let nextState;
  try {
    const serverNow = new Date().toISOString();
    nextState = holdOrdinaryDealForPresentation(activateDealOneAfterPresentation(loaded.canonicalState, serverNow), serverNow);
  } catch {
    return { ok: false, code: "INVALID_CANONICAL_STATE" };
  }

  const actionId = await stableInternalActionId(gameId, "activate-deal-one-after-presentation-v1");
  const persisted = await persistCanonicalGameState({
    gameId,
    actionId,
    commandType: "activate_initial_deal",
    expectedStateVersion: loaded.stateVersion,
    commandPayload: { source: "all_humans_presented" },
    newState: nextState,
  });
  if (!persisted.ok) {
    if (persisted.code === "STALE_STATE" || persisted.code === "ACTION_ID_CONFLICT") {
      const winner = await loadCanonicalGameState(gameId);
      if (winner.ok && winner.canonicalState.lifecycle === "active") {
        return { ok: true, gameId, stateVersion: winner.stateVersion, replayed: true };
      }
    }
    return { ok: false, code: persisted.code };
  }
  return { ok: true, gameId, stateVersion: persisted.stateVersion, replayed: persisted.replayed };
}

/** Backward-compatible explicit resolver for older tests/internal callers. */
export const ensureInitialDealerBootstrap = resolveInitialDealerBootstrap;
