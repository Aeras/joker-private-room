import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";
import type {
  CanonicalDialogueBotId,
  DialogueEventType,
  PublicDialogueEvent,
} from "../../supabase/functions/_shared/dialogue-core";

function botSpeakers(room: Room): CanonicalDialogueBotId[] {
  return room.seats.flatMap((seat) =>
    seat.occupant.type === "bot" ? [seat.occupant.bot.id as CanonicalDialogueBotId] : [],
  );
}

function occupantName(room: Room, seat: number): string {
  const occupant = room.seats[seat]?.occupant;
  if (!occupant) return `Θέση ${seat + 1}`;
  if (occupant.type === "human") return occupant.player.displayName;
  if (occupant.type === "bot") return occupant.bot.displayName;
  return `Θέση ${seat + 1}`;
}

function event(
  next: PlayerGameProjection,
  room: Room,
  type: DialogueEventType,
  targetSeat: number | undefined,
  details: Partial<PublicDialogueEvent> = {},
  salt = 0,
): PublicDialogueEvent | null {
  const bots = botSpeakers(room);
  if (bots.length === 0) return null;
  const speakerBotId = bots[(next.stateVersion + salt) % bots.length]!;
  return {
    id: `state-${next.stateVersion}:${type}:${targetSeat ?? "all"}:${salt}`,
    type,
    createdAt: new Date().toISOString(),
    speakerBotId,
    ...(targetSeat == null ? {} : { targetSeat, targetName: occupantName(room, targetSeat) }),
    ...details,
    replyDepth: 0,
  };
}

/** Public projection only: this helper cannot see canonical hands, deck order or future cards. */
export function derivePublicDialogueEvents(
  previous: PlayerGameProjection | null,
  next: PlayerGameProjection,
  room: Room,
): PublicDialogueEvent[] {
  if (!previous || next.stateVersion <= previous.stateVersion) return [];
  const events: PublicDialogueEvent[] = [];

  next.declarations.values.forEach((value, seat) => {
    if (value == null || value === previous.declarations.values[seat]) return;
    let type: DialogueEventType | null = null;
    if (value === 0) type = "PLAYER_DECLARED_ZERO";
    else if (value >= Math.max(4, next.progression.cardsPerPlayer - 1)) type = "PLAYER_DECLARED_HIGH";
    if (!type) return;
    const derived = event(next, room, type, seat, { declared: value }, seat);
    if (derived) events.push(derived);
  });

  if (next.score.completedDeals.length > previous.score.completedDeals.length) {
    const deal = next.score.completedDeals.at(-1);
    if (deal) {
      deal.dealScores.forEach((scoreDelta, seat) => {
        const declared = deal.declarations[seat] ?? 0;
        const actualTricks = deal.tricksTaken[seat] ?? 0;
        let type: DialogueEventType | null = null;
        if (scoreDelta === -200) type = room.seats[seat]?.occupant.type === "bot" ? "BOT_GOT_MINUS_200" : "PLAYER_GOT_MINUS_200";
        else if (declared === actualTricks) type = room.seats[seat]?.occupant.type === "bot" ? "BOT_HIT_EXACT_BID" : "PLAYER_HIT_EXACT_BID";
        else if (actualTricks > declared) type = "OVERTRICK";
        else if (actualTricks < declared) type = "UNDERTRICK";
        if (!type) return;
        const derived = event(next, room, type, seat, {
          declared,
          actualTricks,
          scoreDelta,
          round: next.progression.round,
          deal: deal.dealNumber,
          publicSummary: `${occupantName(room, seat)}: δήλωση ${declared}, μπάζες ${actualTricks}, μεταβολή ${scoreDelta}.`,
        }, seat + 10);
        if (derived) events.push(derived);
      });
    }
  }

  if (next.cards.completedTricks.length > previous.cards.completedTricks.length) {
    const trick = next.cards.completedTricks.at(-1);
    if (trick?.cards.some((play) => play.card.kind === "joker")) {
      const derived = event(next, room, "JOKER_PLAYED", trick.winnerSeat, {
        round: next.progression.round,
        deal: next.progression.dealNumber,
      }, 30);
      if (derived) events.push(derived);
    } else if (trick && room.botSettings.intensity === "chaos") {
      const derived = event(next, room, "TRICK_WON", trick.winnerSeat, {
        round: next.progression.round,
        deal: next.progression.dealNumber,
        publicSummary: `${occupantName(room, trick.winnerSeat)} κέρδισε την μπάζα.`,
      }, 31);
      if (derived) events.push(derived);
    }
  }

  if (next.score.roundPremia.length > previous.score.roundPremia.length) {
    const premia = next.score.roundPremia.at(-1);
    const winner = premia?.adjustments.findIndex((value) => value > 0) ?? -1;
    const derived = event(next, room, "PREMIA_ACHIEVED", winner >= 0 ? winner : undefined, {
      round: next.progression.round,
    }, 40);
    if (derived) events.push(derived);
  }

  if (previous.lifecycle !== "complete" && next.lifecycle === "complete") {
    const derived = event(next, room, "GAME_END", undefined, {
      publicSummary: `Τελικό σκορ: ${next.score.cumulativeTotals.join(", ")}.`,
    }, 50);
    if (derived) events.push(derived);
  }

  return events.slice(0, 4);
}
