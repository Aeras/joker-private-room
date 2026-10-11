import { useCallback, useEffect, useRef, useState } from "react";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import type { DurakPresentationEvent } from "./engine";

export const DURAK_CARD_FLIGHT_MS = 320;
export const DURAK_PLAY_BEAT_MS = 120;
export const DURAK_CLEAR_MS = 760;
const sameCard = (a: { suit: string; rank: number }, b: { suit: string; rank: number }) =>
  a.suit === b.suit && a.rank === b.rank;

/** Animate confirmed public plays; initial/reconnected views always start at the latest state. */
export function useDurakPresentation(roomCode: string) {
  const [game, setGame] = useState<DurakGameView | null>(null);
  const [flight, setFlight] = useState<DurakPresentationEvent | null>(null);
  const [clearing, setClearing] = useState(false);
  const latest = useRef<DurakGameView | null>(null);
  const shown = useRef<DurakGameView | null>(null);
  const queue = useRef<DurakPresentationEvent[]>([]);
  const sequence = useRef(0);
  const clearedRound = useRef(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);
  const room = useRef(roomCode);
  room.current = roomCode;
  const mounted = useRef(true);

  const stop = useCallback(() => {
    run.current++;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queue.current = [];
  }, []);
  useEffect(() => {
    mounted.current = true;
    stop();
    latest.current = null;
    shown.current = null;
    sequence.current = 0;
    clearedRound.current = -1;
    setGame(null);
    setFlight(null);
    setClearing(false);
    return () => {
      mounted.current = false;
      stop();
    };
  }, [roomCode, stop]);

  const accept = useCallback(
    (next: DurakGameView) => {
      if (!mounted.current || room.current !== roomCode) return;
      if (latest.current && next.revision < latest.current.revision) return;
      const baseline = latest.current;
      latest.current = next;
      const incomingSequence = next.presentationSequence ?? 0;
      const pending = (next.events ?? [])
        .filter((event) => event.sequence > sequence.current)
        .sort((a, b) => a.sequence - b.sequence);
      // A bounded history can have a gap after a long absence. Never manufacture plays.
      if (
        !baseline ||
        incomingSequence < sequence.current ||
        (incomingSequence > sequence.current &&
          (pending[0]?.sequence !== sequence.current + 1 ||
            pending.at(-1)?.sequence !== incomingSequence ||
            pending.some((event, index) => event.sequence !== sequence.current + index + 1)))
      ) {
        stop();
        sequence.current = incomingSequence;
        shown.current = next;
        setGame(next);
        setFlight(null);
        setClearing(false);
        return;
      }
      sequence.current = incomingSequence;
      queue.current.push(...pending);
      if (timer.current !== null) return;
      const token = run.current;
      const advance = () => {
        if (token !== run.current) return;
        const upcoming = queue.current[0];
        const visibleRound = shown.current;
        // A batched server response can contain the last defense and the next attack.
        // Animate the completed, defended bout before showing the next round.
        if (upcoming && visibleRound && upcoming.round > visibleRound.round &&
            visibleRound.pairs.length > 0 && visibleRound.pairs.every(pair => Boolean(pair.defense)) &&
            (upcoming.discardCount ?? latest.current?.discardCount ?? 0) > visibleRound.discardCount &&
            clearedRound.current !== visibleRound.round) {
          clearedRound.current = visibleRound.round;
          setFlight(null);
          setClearing(true);
          timer.current = setTimeout(() => {
            if (token !== run.current) return;
            setClearing(false);
            advance();
          }, DURAK_CLEAR_MS);
          return;
        }
        const event = queue.current.shift();
        if (!event) {
          const previous = shown.current;
          const incoming = latest.current;
          const boutClosed = previous && incoming && previous.pairs.length > 0 &&
            previous.pairs.every(pair => Boolean(pair.defense)) && incoming.discardCount > previous.discardCount &&
            clearedRound.current !== previous.round && incoming.pairs.length === 0 &&
            (incoming.round > previous.round || incoming.ended);
          if (boutClosed) {
            clearedRound.current = previous.round;
            setFlight(null);
            setClearing(true);
            timer.current = setTimeout(() => {
              if (token !== run.current) return;
              shown.current = latest.current;
              setGame(latest.current);
              setClearing(false);
              timer.current = null;
            }, DURAK_CLEAR_MS);
            return;
          }
          timer.current = null;
          shown.current = latest.current;
          setGame(latest.current);
          setFlight(null);
          setClearing(false);
          return;
        }
        const previous = shown.current ?? next;
        const visible: DurakGameView = {
          ...previous,
          pairs: event.pairs,
          round: event.round,
          attacker: event.attacker,
          defender: event.defender,
          attackSeats: event.attackSeats,
          handSizes: event.handSizes,
          // Keep the visible pile in sync with the finished bout, not the next server move.
          discardCount: event.round > previous.round ? (event.discardCount ?? previous.discardCount) : previous.discardCount,
          ended: false,
          legalMoves: [],
          myHand:
            event.seat === previous.seat
              ? previous.myHand.filter((card) => !sameCard(card, event.card))
              : previous.myHand,
        };
        shown.current = visible;
        setGame(visible);
        setFlight(event);
        timer.current = setTimeout(advance, DURAK_CARD_FLIGHT_MS + DURAK_PLAY_BEAT_MS);
      };
      advance();
    },
    [stop, roomCode],
  );
  return { game, flight, clearing, accept, presenting: flight !== null || clearing };
}
