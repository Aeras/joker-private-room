import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, MessageCircle, Minimize, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assets } from "@/assets/registry";
import { pickBotReply } from "@/bots/personality";
import { TURN_DURATION_SECONDS, SEAT_COUNT } from "@/domain/gameConfig";
import { occupantName, type Room } from "@/domain/players";
import { useDemoTable } from "@/demo/useDemoTable";
import { useEphemeralBubbles } from "@/hooks/useEphemeralBubbles";
import { useTurnTimer } from "@/hooks/useTurnTimer";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { createLocalEphemeralChannel } from "@/services/ephemeral";
import { JButton } from "../joker/JButton";
import { PlayingCard } from "../joker/PlayingCard";
import { ChatPanel } from "./ChatPanel";
import { Scoreboard } from "./Scoreboard";
import { SpeechBubble } from "./SpeechBubble";
import { TableSeat } from "./TableSeat";
import { TurnTimer } from "./TurnTimer";

type Pos = 0 | 1 | 2 | 3;
const TRICK_OFFSET: Record<Pos, string> = { 0: "translate-y-[38%]", 1: "-translate-x-[58%] -rotate-6", 2: "-translate-y-[38%]", 3: "translate-x-[58%] rotate-6" };
type OrientationLock = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };

export function GameTable({ room, localPlayerId }: { room: Room; localPlayerId: string }) {
  const tableRootRef = useRef<HTMLDivElement>(null);
  const localSeat = Math.max(0, room.seats.findIndex((s) => s.occupant.type === "human" && s.occupant.player.id === localPlayerId));
  const demo = useDemoTable(room, localSeat);
  const seconds = useTurnTimer(TURN_DURATION_SECONDS, demo.turnKey, demo.activeSeat === localSeat);
  const [chatOpen, setChatOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const channel = useMemo(() => createLocalEphemeralChannel(), []);
  const bubbles = useEphemeralBubbles(channel);
  const names = room.seats.map((s) => occupantName(s.occupant) ?? t.emptySeat);
  const nameAt = (i: number) => names[i] ?? "";
  const seatAt = (pos: Pos) => (localSeat + pos) % SEAT_COUNT;
  const posOf = (seat: number) => ((seat - localSeat + SEAT_COUNT) % SEAT_COUNT) as Pos;

  useEffect(() => { const update = () => setPortrait(window.innerHeight > window.innerWidth); update(); window.addEventListener("resize", update); window.addEventListener("orientationchange", update); return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); }; }, []);
  useEffect(() => { const change = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", change); return () => document.removeEventListener("fullscreenchange", change); }, []);
  useEffect(() => channel.subscribe((m) => { if (m.fromSeat !== localSeat) return; const targets = m.to === "all" ? room.seats.map((s) => s.index) : [m.to]; const bot = room.seats.find((s) => targets.includes(s.index) && s.occupant.type === "bot"); if (!bot || bot.occupant.type !== "bot") return; const reply = pickBotReply(bot.occupant.bot.personalityId, room.botSettings, { type: "message_received", fromName: nameAt(localSeat) }); if (reply) setTimeout(() => channel.send({ fromSeat: bot.index, to: localSeat, text: reply }), 1200); }), [channel, room, localSeat, names]);

  const toggleFullscreen = async () => { try { if (!document.fullscreenElement) { await tableRootRef.current?.requestFullscreen(); const orientation = screen.orientation as OrientationLock; await orientation.lock?.("landscape").catch(() => undefined); } else await document.exitFullscreen(); } catch { /* browser/OS fallback */ } };
  const bubbleFor = (seat: number) => { const b = bubbles.find((x) => x.fromSeat === seat); return b ? <SpeechBubble text={b.text} toLabel={b.to === "all" ? t.everyone : nameAt(b.to)} /> : null; };
  const seatBlock = (pos: Pos, orientation: "horizontal" | "vertical") => { const seat = seatAt(pos); return <div className="relative flex flex-col items-center gap-0.5">{pos !== 2 && <div className="absolute bottom-full mb-1 z-30">{bubbleFor(seat)}</div>}<TableSeat seat={room.seats[seat]!} stats={demo.seatStats(seat)} orientation={orientation} showCards={pos !== 0} local={pos === 0} />{pos === 2 && <div className="absolute top-full mt-1 z-30">{bubbleFor(seat)}</div>}</div>; };
  const isMyTurn = demo.activeSeat === localSeat;

  return <div ref={tableRootRef} className="joker-room relative h-dvh w-full overflow-hidden bg-[#090b09]">
    {assets.tableArt && <img src={assets.tableArt} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center select-none" />}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

    {portrait && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/95 px-8 text-center backdrop-blur-sm"><div className="max-w-sm rounded-3xl border border-primary/35 bg-card/95 p-6 shadow-2xl"><div className="mb-3 text-4xl">↻</div><div className="font-display text-xl text-primary">Γύρισε τη συσκευή οριζόντια</div><p className="mt-2 text-sm text-muted-foreground">Το τραπέζι είναι σχεδιασμένο για landscape προβολή.</p><JButton className="mt-5" variant="outlineGold" onClick={toggleFullscreen}><Maximize className="h-4 w-4" /> Πλήρης οθόνη</JButton></div></div>}

    <header className="absolute inset-x-0 top-0 z-50 flex items-center gap-1 px-[max(.35rem,env(safe-area-inset-left))] pt-[max(.25rem,env(safe-area-inset-top))]">
      <Link to="/lobby" search={{ code: undefined }} aria-label={t.back} className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white/75 backdrop-blur"><ArrowLeft className="h-4 w-4" /></Link>
      <div className="ml-auto flex items-center gap-1"><TurnTimer seconds={seconds} /><JButton variant="secondary" size="sm" className="h-8 px-2 bg-black/60" onClick={() => setChatOpen(true)} aria-label={t.chat}><MessageCircle className="h-4 w-4" /><span className="hidden lg:inline">{t.chat}</span></JButton><JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={() => setScoreOpen(true)} aria-label={t.score}><Trophy className="h-4 w-4" /><span className="hidden lg:inline">{t.score}</span></JButton><JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={toggleFullscreen} aria-label={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</JButton></div>
    </header>

    <main className="absolute inset-x-[5vw] top-[10vh] bottom-[25vh]">
      <div className="relative h-full w-full">
        <div className="absolute left-1/2 top-[1%] z-20 -translate-x-1/2">{seatBlock(2, "horizontal")}</div>
        <div className="absolute left-[2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(1, "vertical")}</div>
        <div className="absolute right-[2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(3, "vertical")}</div>
        <div className="absolute left-1/2 top-[55%] z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [--card-w:clamp(2.2rem,4.7vw,4rem)]">{demo.trick.map((p) => <div key={p.card.id} className={cn("animate-card-drop absolute", TRICK_OFFSET[posOf(p.seatIndex)])}><PlayingCard card={p.card} /></div>)}</div>
      </div>
    </main>

    <footer className="absolute inset-x-0 bottom-[max(.15rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center">
      <div className="flex w-full items-end justify-center gap-2 px-3">
        <div className="flex justify-center overflow-visible pt-2 [--card-w:clamp(2.35rem,5.8vw,4rem)]">{demo.hand.map((c, i) => <div key={c.id} className={cn(i > 0 && "-ml-[calc(var(--card-w)*0.30)]")} style={{ zIndex: i }}><PlayingCard card={c} selected={demo.selectedId === c.id} onClick={isMyTurn ? () => demo.toggleSelect(c.id) : undefined} /></div>)}</div>
        <JButton size="sm" className="mb-2 shrink-0" disabled={!demo.selectedId || !isMyTurn} onClick={demo.playSelected}>{t.playCard}</JButton>
      </div>
      <div className="-mt-1">{seatBlock(0, "horizontal")}</div>
    </footer>

    <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} recipients={[...[1,2,3].map((p) => ({ value: seatAt(p as Pos), label: nameAt(seatAt(p as Pos)) })), { value: "all" as const, label: t.everyone }]} onSend={(to, text) => channel.send({ fromSeat: localSeat, to, text })} />
    <Scoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} sheet={demo.sheet} />
  </div>;
}
