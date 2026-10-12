import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { GameTable } from "@/components/table/GameTable";
import { LandscapeTableGuard } from "@/components/table/LandscapeTableGuard";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "@/test/fixtures/reconciliationGame";
import type { Room } from "@/domain/players";

export const Route = createFileRoute("/zzprobe")({ ssr: false, component: Probe });

function make() {
  const state = reconciliationFixture();
  state.progression.phase = "CARD_PLAY";
  const p = projectGameForSeat(state, 0);
  p.initialDealerSelection = { status: "pending" } as typeof p.initialDealerSelection;
  p.cards.currentTrick = [{ seatIndex: 3, card: { id: "h-K", kind: "standard", suit: "hearts", rank: "K" } as never }];
  p.cards.completedTricks = [];
  p.cards.ownHand = [{ id: "joker-1", kind: "joker" } as never, ...p.cards.ownHand.filter(c => c.kind !== "joker").slice(0, 4)];
  p.cards.ownHandVisible = true;
  p.progression.currentActorSeat = 0;
  (p.seats[0] as { controller: string }).controller = "human";
  p.local.legalActions = [{ type: "play_card", cardIds: p.cards.ownHand.map(c => c.id), jokerOptions: [{ context: "OPEN_TRICK", mode: "COMPETE" }, { context: "OPEN_TRICK", mode: "FROM_BELOW" }] }];
  const room = { code: "TEST", hostId: "host", seats: state.seats.map((_, index) => ({ index, occupant: index === 0 ? { type: "human", player: { id: "me", displayName: "Me" } } : { type: "bot", bot: { id: String(index), displayName: `Seat ${index}` } } })) } as Room;
  return { p, room };
}
function Probe() {
  const [{ p, room }] = useState(make);
  useEffect(() => {
    const log = (e: Event) => { const t = e.target as Element; (window as any).__log = [...((window as any).__log ?? []), `${e.type}:${t?.tagName}:${(t?.textContent ?? "").slice(0, 18)}:${(t as HTMLElement)?.dataset ? Object.keys((t as HTMLElement).dataset).join(",") : ""}`]; };
    for (const ev of ["pointerdown", "pointerup", "click", "touchstart", "touchend", "mousedown", "dblclick"]) document.addEventListener(ev, log, true);
  }, []);
  return <div id="table-fullscreen-root" className="relative h-dvh overflow-hidden bg-[#090b09]"><LandscapeTableGuard>
    <GameTable room={room} projection={p} busy={false} error={null} onCommand={async (c) => { (window as any).__cmd = [...((window as any).__cmd ?? []), JSON.stringify(c)]; return null as never; }} onReclaim={async () => {}} onEndGame={async () => false} onNineCardPresentationComplete={() => {}} />
  </LandscapeTableGuard></div>;
}
