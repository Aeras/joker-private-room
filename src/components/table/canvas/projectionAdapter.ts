import type { Card } from "@/domain/cards";
import type { PlayerGameProjection } from "@/domain/projection";
import type { LocalPlayPresentation } from "../localPlayPresentation";
import type { TableGeometry } from "../useTableGeometry";
import { TRICK_CARD_ROTATION } from "../trickPresentationModel";
import { cardFlightPose } from "../cardFlightMotion";
import { LOCAL_FLIGHT_MS, REDUCED_LOCAL_FLIGHT_MS, REDUCED_MOTION_DISTANCE_PX } from "../presentationTiming";
import type { SpritePose } from "./types";
function copyCard(card: Card): Card { return card.kind === "joker" ? { kind: "joker", id: card.id } : { kind: "standard", id: card.id, rank: card.rank, suit: card.suit }; }
function sameCard(a: Card, b: Card) { return a.id === b.id && a.kind === b.kind && (a.kind === "joker" || (b.kind === "standard" && a.suit === b.suit && a.rank === b.rank)); }
/** Explicit allowlist: no spread of a projection, canonical hands, stock or identity secrets. */
export function projectionScene(p: PlayerGameProjection) {
  return { gameId: p.gameId, viewerSeat: p.viewerSeat, stateVersion: p.stateVersion, dealNumber: p.progression.dealNumber,
    ownHand: p.cards.ownHandVisible ? p.cards.ownHand.map(copyCard) : [],
    table: p.cards.currentTrick.filter(play => play.card.kind !== "joker" || play.joker != null).map(play => ({ seat: play.seatIndex, card: copyCard(play.card) })),
  };
}
export class ProjectionSceneAdapter {
  private scope = "";
  private version = -1;
  ingest(p: PlayerGameProjection) {
    const scope = p.gameId + ":" + p.viewerSeat;
    if (scope !== this.scope) { this.scope = scope; this.version = -1; }
    if (p.stateVersion <= this.version) return null;
    this.version = p.stateVersion;
    return projectionScene(p);
  }
  reset() { this.scope = ""; this.version = -1; }
}
export function localFlightInstruction(p: PlayerGameProjection, token: LocalPlayPresentation, geometry: TableGeometry, reduced: boolean) {
  if (token.card.kind !== "standard" || token.gameId !== p.gameId || token.dealNumber !== p.progression.dealNumber || token.actorSeat !== p.viewerSeat || token.sourceStateVersion > p.stateVersion) return null;
  const visible = projectionScene(p);
  const publicCard = [...visible.table, ...p.cards.completedTricks.flatMap(trick => trick.cards.map(play => ({ seat: play.seatIndex, card: play.card }))), ...(p.cards.presentationTail ?? []).flatMap(trick => trick.cards.map(play => ({ seat: play.seatIndex, card: play.card })))].some(play => play.seat === token.actorSeat && sameCard(play.card, token.card));
  if (!visible.ownHand.some(card => sameCard(card, token.card)) && !publicCard) return null;
  const width = token.releaseRect.cardWidth ?? token.releaseRect.width;
  const start = { x: token.releaseRect.left + token.releaseRect.width / 2, y: token.releaseRect.top + token.releaseRect.height / 2 };
  const pos = ((token.actorSeat - p.viewerSeat + 4) % 4) as 0 | 1 | 2 | 3;
  const end = { x: geometry.feltRect.left + geometry.trickSlots[pos].x, y: geometry.feltRect.top + geometry.trickSlots[pos].y };
  const rotation = TRICK_CARD_ROTATION[pos];
  const origin: SpritePose = { ...start, width, height: width * 7 / 5, rotation: token.releaseRect.rotation ?? 0, opacity: 1, flip: 0 };
  return {
    id: [token.gameId, token.dealNumber, token.actorSeat, token.cardId, token.sourceStateVersion].join(":"),
    card: copyCard(token.card), origin, initial: reduced ? { ...origin, ...end, y: end.y + REDUCED_MOTION_DISTANCE_PX, width: geometry.trickCardSize.width, height: geometry.trickCardSize.width * 7 / 5, rotation, opacity: 0 } : origin, duration: reduced ? REDUCED_LOCAL_FLIGHT_MS : LOCAL_FLIGHT_MS,
    sample(time: number): SpritePose {
      const t = 1 - (1 - time) ** 2;
      const pose = cardFlightPose(start, end, origin.rotation, rotation, t);
      const currentWidth = reduced ? geometry.trickCardSize.width : width + (geometry.trickCardSize.width - width) * t;
      return { x: reduced ? end.x : pose.point.x, y: reduced ? end.y + REDUCED_MOTION_DISTANCE_PX * (1 - time) : pose.point.y,
        width: currentWidth, height: currentWidth * 7 / 5, rotation: reduced || time === 1 ? rotation : pose.rotation, opacity: reduced ? time : 1, flip: 0 };
    },
  };
}
export type LocalFlightInstruction = NonNullable<ReturnType<typeof localFlightInstruction>>;

