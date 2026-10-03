import { compareRanks, type Card, type Suit } from "./cards";

export type OpenTrickJokerMode = "COMPETE" | "FROM_BELOW";
export type LeadJokerMode = "HIGHER_SUIT" | "SUIT_WINS";

export type JokerSemantic =
  | { context: "OPEN_TRICK"; mode: OpenTrickJokerMode }
  | { context: "LEAD"; mode: LeadJokerMode; requestedSuit: Suit };

export interface PlayedCard {
  seatIndex: number;
  card: Card;
  joker?: JokerSemantic;
}

export interface PublicDealHistory {
  completedTricks: { cards: PlayedCard[]; winnerSeat: number }[];
}

/** Everything a seat/bot may legitimately know. Never add hidden opponent data. */
export interface PlayerView {
  seatIndex: number;
  hand: Card[];
  cardsPerPlayer: number;
  trump: Suit | null;
  declarations: (number | null)[];
  tricksTaken: number[];
  currentTrick: PlayedCard[];
  history: PublicDealHistory;
}

export interface TrickResolution {
  winnerSeat: number;
  winningPlay: PlayedCard;
  nextLeader: number;
  requestedSuit: Suit;
  reason:
    | "NORMAL_LED_SUIT"
    | "NORMAL_TRUMP"
    | "COMPETING_JOKER"
    | "JOKER_HIGHER_SUIT"
    | "JOKER_HIGHER_SUIT_TRUMPED"
    | "JOKER_SUIT_WINS";
}

function requireValidJokerPlay(play: PlayedCard, index: number): JokerSemantic {
  if (play.card.kind !== "joker") {
    if (play.joker) throw new Error("Normal card cannot carry Joker semantics");
    throw new Error("Expected Joker play");
  }
  if (!play.joker) throw new Error("Joker play requires semantic metadata");
  if (index === 0 && play.joker.context !== "LEAD") {
    throw new Error("Leading Joker requires LEAD semantics");
  }
  if (index > 0 && play.joker.context !== "OPEN_TRICK") {
    throw new Error("Non-leading Joker requires OPEN_TRICK semantics");
  }
  return play.joker;
}

export function requestedSuitForTrick(plays: readonly PlayedCard[]): Suit | null {
  const lead = plays[0];
  if (!lead) return null;
  if (lead.card.kind === "standard") return lead.card.suit;
  const semantic = requireValidJokerPlay(lead, 0);
  if (semantic.context !== "LEAD") throw new Error("Invalid leading Joker semantic");
  return semantic.requestedSuit;
}

/**
 * Jokers remain strategic legal choices. Normal cards obey requested suit,
 * then mandatory trump when void, otherwise discard.
 */
export function legalCards(args: {
  hand: readonly Card[];
  requestedSuit: Suit | null;
  trump: Suit | null;
}): Card[] {
  const { hand, requestedSuit, trump } = args;
  if (!requestedSuit) return hand.slice();

  const jokers = hand.filter((card) => card.kind === "joker");
  const requested = hand.filter(
    (card) => card.kind === "standard" && card.suit === requestedSuit,
  );
  if (requested.length > 0) return [...requested, ...jokers];

  if (trump) {
    const trumps = hand.filter((card) => card.kind === "standard" && card.suit === trump);
    if (trumps.length > 0) return [...trumps, ...jokers];
  }
  return hand.slice();
}

export function legalMoves(view: PlayerView): Card[] {
  return legalCards({
    hand: view.hand,
    requestedSuit: requestedSuitForTrick(view.currentTrick),
    trump: view.trump,
  });
}

function highestStandard(plays: readonly PlayedCard[], suit: Suit): PlayedCard | null {
  const candidates = plays.filter(
    (play) => play.card.kind === "standard" && play.card.suit === suit,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, play) => {
    if (best.card.kind !== "standard" || play.card.kind !== "standard") return best;
    return compareRanks(play.card.rank, best.card.rank) > 0 ? play : best;
  });
}

function lastCompetingJoker(plays: readonly PlayedCard[]): PlayedCard | null {
  let winner: PlayedCard | null = null;
  plays.forEach((play, index) => {
    if (play.card.kind !== "joker" || index === 0) return;
    const semantic = requireValidJokerPlay(play, index);
    if (semantic.context === "OPEN_TRICK" && semantic.mode === "COMPETE") winner = play;
  });
  return winner;
}

function standardWinner(args: {
  plays: readonly PlayedCard[];
  requestedSuit: Suit;
  trump: Suit | null;
}): { play: PlayedCard; reason: "NORMAL_LED_SUIT" | "NORMAL_TRUMP" } {
  const { plays, requestedSuit, trump } = args;
  if (trump) {
    const bestTrump = highestStandard(plays, trump);
    if (bestTrump) return { play: bestTrump, reason: "NORMAL_TRUMP" };
  }
  const bestRequested = highestStandard(plays, requestedSuit);
  if (!bestRequested) throw new Error("No competing standard card for requested suit");
  return { play: bestRequested, reason: "NORMAL_LED_SUIT" };
}

export function resolveTrick(args: {
  plays: readonly PlayedCard[];
  trump: Suit | null;
}): TrickResolution {
  const { plays, trump } = args;
  if (plays.length !== 4) throw new Error("A trick requires exactly four committed plays");
  const seats = new Set(plays.map((play) => play.seatIndex));
  if (seats.size !== 4) throw new Error("Each seat must play exactly once");

  plays.forEach((play, index) => {
    if (play.card.kind === "joker") requireValidJokerPlay(play, index);
    else if (play.joker) throw new Error("Normal card cannot carry Joker semantics");
  });

  const requestedSuit = requestedSuitForTrick(plays);
  if (!requestedSuit) throw new Error("Trick has no requested suit");

  const competingJoker = lastCompetingJoker(plays);
  if (competingJoker) {
    return {
      winnerSeat: competingJoker.seatIndex,
      winningPlay: competingJoker,
      nextLeader: competingJoker.seatIndex,
      requestedSuit,
      reason: "COMPETING_JOKER",
    };
  }

  const lead = plays[0]!;
  if (lead.card.kind === "joker") {
    const semantic = requireValidJokerPlay(lead, 0);
    if (semantic.context !== "LEAD") throw new Error("Invalid leading Joker semantic");

    if (semantic.mode === "HIGHER_SUIT") {
      if (trump && semantic.requestedSuit !== trump) {
        const bestTrump = highestStandard(plays, trump);
        if (bestTrump) {
          return {
            winnerSeat: bestTrump.seatIndex,
            winningPlay: bestTrump,
            nextLeader: bestTrump.seatIndex,
            requestedSuit,
            reason: "JOKER_HIGHER_SUIT_TRUMPED",
          };
        }
      }
      return {
        winnerSeat: lead.seatIndex,
        winningPlay: lead,
        nextLeader: lead.seatIndex,
        requestedSuit,
        reason: "JOKER_HIGHER_SUIT",
      };
    }

    const standard = standardWinner({ plays, requestedSuit, trump });
    return {
      winnerSeat: standard.play.seatIndex,
      winningPlay: standard.play,
      nextLeader: standard.play.seatIndex,
      requestedSuit,
      reason: "JOKER_SUIT_WINS",
    };
  }

  const standard = standardWinner({ plays, requestedSuit, trump });
  return {
    winnerSeat: standard.play.seatIndex,
    winningPlay: standard.play,
    nextLeader: standard.play.seatIndex,
    requestedSuit,
    reason: standard.reason,
  };
}
