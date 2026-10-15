import type { BiribaMatch } from "./engine.ts";
import { BIRIBA_PACKET_SIZE, biribaTeamOf } from "./rules.ts";

/** Repair only the legacy, active meld turn that missed its first packet. */
export function recoverUnclaimedBiribaPacket(match: BiribaMatch): BiribaMatch {
  if (
    match.phase !== "meld" ||
    match.roundEnded ||
    match.roundScored ||
    match.matchFinished ||
    !Number.isInteger(match.turn) ||
    match.turn < 0 ||
    match.turn >= match.seats
  )
    return match;
  const seat = match.turn;
  const team = biribaTeamOf(seat, match.seats);
  const packet = match.packets[team];
  if (
    match.hands[seat]?.length !== 0 ||
    !match.opened[seat] ||
    match.packetTaken[team] !== false ||
    match.packetPlayed[team] !== false ||
    match.packetOwner[team] !== null ||
    match.pendingPacket[team] !== null ||
    match.forcedDiscardSeat !== null ||
    packet?.length !== BIRIBA_PACKET_SIZE
  )
    return match;
  // An incomplete or duplicated packet is not safe to move into a hand.
  const packetIds = packet.map((card) => card.id);
  if (
    packetIds.some((id) => typeof id !== "string" || !id) ||
    new Set(packetIds).size !== packetIds.length
  )
    return match;
  const elsewhere = [
    ...match.hands.flat(),
    ...match.stock,
    ...match.discards,
    ...match.melds.flatMap((meld) => meld.cards.map((placement) => placement.card)),
  ];
  if (elsewhere.some((card) => packetIds.includes(card.id))) return match;
  const hands = match.hands.map((hand) => [...hand]);
  const packets = match.packets.map((cards) => [...cards]);
  hands[seat] = [...packet];
  packets[team] = [];
  const packetTaken = [...match.packetTaken];
  packetTaken[team] = true;
  const packetPlayed = [...match.packetPlayed];
  packetPlayed[team] = true;
  const packetOwner = [...match.packetOwner];
  packetOwner[team] = seat;
  return { ...match, hands, packets, packetTaken, packetPlayed, packetOwner };
}
