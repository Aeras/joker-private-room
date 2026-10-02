/**
 * DEMO ONLY. Local table simulation: random hand, card play into the trick,
 * and placeholder bot plays. NOT rules validation — the real engine is server-side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDeck, type Card } from "@/domain/cards";
import type { PlayedCard } from "@/domain/engine";
import { SEAT_COUNT } from "@/domain/gameConfig";
import { computeTotals } from "@/domain/scoreSheet";
import type { Room } from "@/domain/players";
import { createDemoScoreSheet } from "./demoScores";

const HAND_SIZE = 9;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function useDemoTable(room: Room, localSeat: number) {
  const [{ hand, pool }] = useState(() => {
    const d = shuffle(createDeck());
    return { hand: d.slice(0, HAND_SIZE), pool: d.slice(HAND_SIZE) };
  });
  const [myHand, setMyHand] = useState<Card[]>(hand);
  const poolRef = useRef(pool);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trick, setTrick] = useState<PlayedCard[]>([]);
  const [activeSeat, setActiveSeat] = useState(localSeat);
  const [otherCounts, setOtherCounts] = useState<number[]>(() => Array(SEAT_COUNT).fill(HAND_SIZE));
  const [turnKey, setTurnKey] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const sheet = useMemo(() => createDemoScoreSheet(), []);
  const totals = useMemo(() => computeTotals(sheet), [sheet]);
  const declarations = [2, 1, 3, 0];
  const [tricksTaken] = useState([1, 0, 1, 0]);
  const dealerSeat = (localSeat + 3) % SEAT_COUNT;

  const playSelected = useCallback(() => {
    const card = myHand.find((c) => c.id === selectedId);
    if (!card || activeSeat !== localSeat) return;
    setMyHand((h) => h.filter((c) => c.id !== card.id));
    setSelectedId(null);
    setTrick([{ seatIndex: localSeat, card }]);
    // Placeholder bot/opponent plays (demo only).
    for (let k = 1; k < SEAT_COUNT; k++) {
      const seat = (localSeat + k) % SEAT_COUNT;
      timers.current.push(
        setTimeout(() => {
          setActiveSeat(seat);
          const next = poolRef.current.shift();
          if (next) setTrick((tr) => [...tr, { seatIndex: seat, card: next }]);
          setOtherCounts((c) => c.map((n, i) => (i === seat ? Math.max(0, n - 1) : n)));
        }, 700 * k),
      );
    }
    timers.current.push(
      setTimeout(() => {
        setTrick([]);
        setActiveSeat(localSeat);
        setTurnKey((x) => x + 1);
      }, 700 * SEAT_COUNT + 1400),
    );
  }, [myHand, selectedId, activeSeat, localSeat]);

  return {
    room,
    hand: myHand,
    selectedId,
    toggleSelect: (id: string) => setSelectedId((s) => (s === id ? null : id)),
    playSelected,
    trick,
    activeSeat,
    turnKey,
    sheet,
    seatStats: (seat: number) => ({
      totalScore: totals[seat] ?? 0,
      declaration: declarations[seat] ?? null,
      tricksTaken: tricksTaken[seat] ?? 0,
      isDealer: seat === dealerSeat,
      isActive: seat === activeSeat,
      cardCount: seat === localSeat ? myHand.length : (otherCounts[seat] ?? 0),
    }),
  };
}
