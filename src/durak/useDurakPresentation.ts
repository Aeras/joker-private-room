import { useCallback, useEffect, useRef, useState } from "react";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import type { DurakPresentationEvent, DurakPublicEvent } from "./engine";
import type { DurakCard } from "./rules";
export const DURAK_CARD_FLIGHT_MS = 320;
export const DURAK_PLAY_BEAT_MS = 120;
export const DURAK_CLEAR_MS = 760;
export type DurakCollection = {
  id: number;
  from: number;
  to: number;
  cards: DurakCard[];
  kind?: "take";
  receiver?: number;
  localSeat?: number;
};
const sameCard = (a: DurakCard, b: DurakCard) => a.suit === b.suit && a.rank === b.rank;

/** Queue confirmed public events. A collection completes from actual overlay landings. */
export function useDurakPresentation(roomCode: string) {
  const [game, setGame] = useState<DurakGameView | null>(null);
  const [flight, setFlight] = useState<DurakPresentationEvent | null>(null);
  const [collection, setCollection] = useState<DurakCollection | null>(null);
  const active = useRef<DurakCollection | null>(null);
  const landed = useRef(new Set<number>());
  const resume = useRef<(() => void) | null>(null);
  const latest = useRef<DurakGameView | null>(null);
  const shown = useRef<DurakGameView | null>(null);
  const queue = useRef<DurakPublicEvent[]>([]);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);
  const room = useRef(roomCode);
  room.current = roomCode;
  const mounted = useRef(true);
  const display = useCallback((next: DurakGameView | null) => {
    shown.current = next;
    setGame(next);
  }, []);
  const stop = useCallback(() => {
    run.current++;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queue.current = [];
    active.current = null;
    resume.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    stop();
    latest.current = null;
    shown.current = null;
    sequence.current = 0;
    setGame(null);
    setFlight(null);
    setCollection(null);
    return () => {
      mounted.current = false;
      stop();
    };
  }, [roomCode, stop]);
  const landDiscard = useCallback(
    (id: number, index: number) => {
      const current = active.current;
      if (
        !mounted.current ||
        !current ||
        current.kind === "take" ||
        current.id !== id ||
        index < 0 ||
        index >= current.cards.length
      )
        return;
      landed.current.add(index);
      if (shown.current)
        display({ ...shown.current, discardCount: current.from + landed.current.size });
    },
    [display],
  );
  const finishDiscard = useCallback(
    (id: number) => {
      const current = active.current;
      if (!mounted.current || !current || current.id !== id) return;
      if (shown.current) display({ ...shown.current, discardCount: current.to, pairs: [] });
      active.current = null;
      setCollection(null);
      const advance = resume.current;
      resume.current = null;
      advance?.();
    },
    [display],
  );
  const accept = useCallback(
    (next: DurakGameView) => {
      if (!mounted.current || room.current !== roomCode) return;
      if (latest.current && next.revision < latest.current.revision) return;
      const baseline = latest.current;
      latest.current = next;
      const incomingSequence = next.presentationSequence ?? 0;
      const pending = (next.events ?? [])
        .filter((e) => e.sequence > sequence.current)
        .sort((a, b) => a.sequence - b.sequence);
      if (
        !baseline ||
        incomingSequence < sequence.current ||
        (incomingSequence > sequence.current &&
          (pending[0]?.sequence !== sequence.current + 1 ||
            pending.at(-1)?.sequence !== incomingSequence ||
            pending.some((e, i) => e.sequence !== sequence.current + i + 1)))
      ) {
        stop();
        sequence.current = incomingSequence;
        display(next);
        setFlight(null);
        setCollection(null);
        return;
      }
      sequence.current = incomingSequence;
      queue.current.push(...pending);
      if (timer.current !== null || active.current) return;
      const token = run.current;
      const advance = () => {
        if (token !== run.current) return;
        timer.current = null;
        const event = queue.current.shift();
        if (!event) {
          display(latest.current);
          setFlight(null);
          return;
        }
        const previous = shown.current ?? next;
        if (!("card" in event)) {
          setFlight(null);
          const cards = event.pairs.flatMap((p) =>
            p.defense ? [p.attack, p.defense] : [p.attack],
          );
          const delta = event.discardCount - previous.discardCount;
          if (event.kind === "take" && delta === 0 && cards.length > 0) {
            const receiver = previous.defender;
            const pendingCollection: DurakCollection = {
              id: event.sequence,
              from: previous.discardCount,
              to: event.discardCount,
              cards,
              kind: "take",
              receiver,
              localSeat: previous.seat,
            };
            // These are already-public, server-confirmed table cards, never a hidden hand/deck.
            display({
              ...previous,
              pairs: event.pairs,
              legalMoves: [],
              ended: false,
              handSizes: previous.handSizes.map(
                (size, seat) => size + (seat === receiver ? cards.length : 0),
              ),
              myHand:
                receiver === previous.seat
                  ? [
                      ...previous.myHand,
                      ...cards.filter(
                        (card) => !previous.myHand.some((own) => sameCard(own, card)),
                      ),
                    ]
                  : previous.myHand,
            });
            active.current = pendingCollection;
            resume.current = advance;
            setCollection(pendingCollection);
            return;
          }
          // Never classify a take from the appearance of covered cards. Exact public resolution is mandatory.
          if (
            event.kind === "discard" &&
            delta === cards.length &&
            delta > 0 &&
            event.pairs.every((p) => p.defense)
          ) {
            const pendingCollection = {
              id: event.sequence,
              from: previous.discardCount,
              to: event.discardCount,
              cards,
            };
            display({ ...previous, pairs: event.pairs, legalMoves: [], ended: false });
            landed.current.clear();
            active.current = pendingCollection;
            resume.current = advance;
            setCollection(pendingCollection);
            return;
          }
          display({ ...previous, pairs: [], discardCount: event.discardCount });
          advance();
          return;
        }
        display({
          ...previous,
          pairs: event.pairs,
          round: event.round,
          attacker: event.attacker,
          defender: event.defender,
          attackSeats: event.attackSeats,
          handSizes: event.handSizes,
          ended: false,
          legalMoves: [],
          myHand:
            event.seat === previous.seat
              ? previous.myHand.filter((c) => !sameCard(c, event.card))
              : previous.myHand,
        });
        setFlight(event);
        timer.current = setTimeout(advance, DURAK_CARD_FLIGHT_MS + DURAK_PLAY_BEAT_MS);
      };
      advance();
    },
    [display, roomCode, stop],
  );
  return {
    game,
    flight,
    collection,
    landDiscard,
    finishDiscard,
    accept,
    presenting: flight !== null || collection !== null,
  };
}
