import { SEAT_COUNT } from "./gameConfig";
import { nextSeat, type SeatIndex } from "./dealing";

export type Declarations = [number | null, number | null, number | null, number | null];

export function declarationOrder(dealerSeat: SeatIndex): SeatIndex[] {
  return [
    nextSeat(dealerSeat, 1),
    nextSeat(dealerSeat, 2),
    nextSeat(dealerSeat, 3),
    dealerSeat,
  ];
}

export function nextDeclarer(
  dealerSeat: SeatIndex,
  declarations: Declarations,
): SeatIndex | null {
  return declarationOrder(dealerSeat).find((seat) => declarations[seat] == null) ?? null;
}

export function legalDeclarationValues(args: {
  cardsPerPlayer: number;
  dealerSeat: SeatIndex;
  seatIndex: SeatIndex;
  declarations: Declarations;
}): number[] {
  const { cardsPerPlayer, dealerSeat, seatIndex, declarations } = args;
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 1 || cardsPerPlayer > 9) {
    throw new Error("cardsPerPlayer must be an integer from 1 to 9");
  }
  const expected = nextDeclarer(dealerSeat, declarations);
  if (expected !== seatIndex) return [];

  const values = Array.from({ length: cardsPerPlayer + 1 }, (_, value) => value);
  if (seatIndex !== dealerSeat) return values;

  const others = declarations.filter((_, index) => index !== dealerSeat);
  if (others.some((value) => value == null)) return [];
  const declaredByOthers = others.reduce((sum, value) => sum + (value ?? 0), 0);
  const forbidden = cardsPerPlayer - declaredByOthers;
  return values.filter((value) => value !== forbidden);
}

export function applyDeclaration(args: {
  cardsPerPlayer: number;
  dealerSeat: SeatIndex;
  seatIndex: SeatIndex;
  declarations: Declarations;
  declared: number;
}): Declarations {
  const legal = legalDeclarationValues(args);
  if (!legal.includes(args.declared)) {
    throw new Error("Illegal declaration");
  }
  const next = args.declarations.slice() as Declarations;
  next[args.seatIndex] = args.declared;
  return next;
}

export function declarationsAreComplete(declarations: Declarations): boolean {
  return declarations.length === SEAT_COUNT && declarations.every((value) => value != null);
}
