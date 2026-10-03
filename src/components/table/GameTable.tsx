import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, MessageCircle, Minimize, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pickBotReply } from "@/bots/personality";
import { TURN_DURATION_SECONDS, SEAT_COUNT } from "@/domain/gameConfig";
import { occupantName, type Room } from "@/domain/players";
import { RULESETS } from "@/domain/rulesets";
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
const TRICK_OFFSET: Record<Pos, string> = { 0: "translate-y-[42%]", 1: "-translate-x-[62%] -rotate-6", 2: "-translate-y-[42%]", 3: "translate-x-[62%] rotate-6" };

type OrientationLock = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void>; unlock?: () => void };

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

  useEffect(() => {
    const updateViewport = () => setPortrait(window.innerHeight > window.innerWidth);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => channel.subscribe((m) => {
    if (m.fromSeat !== localSeat) return;
    const targets = m.to === "all" ? room.seats.map((s) => s.index) : [m.to];
    const bot = room.seats.find((s) => targets.includes(s.index) && s.occupant.type === "bot");
    if (!bot || bot.occupant.type !== "bot") return;
    const reply = pickBotReply(bot.occupant.bot.personalityId, room.botSettings, { type: "message_received", fromName: nameAt(localSeat) });
    if (reply) setTimeout(() => channel.send({ fromSeat: bot.index, to: localSeat, text: reply }), 1200);
  }), [channel, room, localSeat, names]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await tableRootRef.current?.requestFullscreen();
        const orientation = screen.orientation as OrientationLock;
        await orientation.lock?.("landscape").catch(() => undefined);
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser/OS may deny fullscreen or orientation lock; portrait fallback remains visible.
    }
  };

  const bubbleFor = (seat: number) => {
    const b = bubbles.find((x) => x.fromSeat === seat);
    return b ? <SpeechBubble text={b.text} toLabel={b.to === "all" ? t.everyone : nameAt(b.to)} /> : null;
  };

  const seatBlock = (pos: Pos, orientation: "horizontal" | "vertical") => {
    const seat = seatAt(pos);
    return <div className="relative flex flex-col items-center gap-1">{pos !== 2 && <div className="absolute bottom-full mb-1 z-30">{bubbleFor(seat)}</div>}<TableSeat seat={room.seats[seat]!} stats={demo.seatStats(seat)} orientation={orientation} showCards={pos !== 0} local={pos === 0} />{pos === 2 && <div className="absolute top-full mt-1 z-30">{bubbleFor(seat)}</div>}</div>;
  };

  const isMyTurn = demo.activeSeat === localSeat;

  return (
    <div ref={tableRootRef} className="joker-room relative flex h-dvh flex-col overflow-hidden bg-background">
      {portrait && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/95 px-8 text-center backdrop-blur-sm"><div className="max-w-sm rounded-3xl border border-primary/35 bg-card/95 p-6 shadow-2xl"><div className="mb-3 text-4xl">↻</div><div className="font-display text-xl text-primary">Γύρισε τη συσκευή οριζόντια</div><p className="mt-2 text-sm text-muted-foreground">Το τραπέζι είναι σχεδιασμένο για landscape προβολή.</p><JButton className="mt-5" variant="outlineGold" onClick={toggleFullscreen}><Maximize className="h-4 w-4" /> Πλήρης οθόνη</JButton></div></div>}

      <header className="relative z-40 flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 sm:px-4">
        <Link to="/lobby" aria-label={t.back} className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/35 text-muted-foreground backdrop-blur hover:bg-black/55"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="hidden min-w-0 sm:block"><div className="font-display text-primary">JOKER</div><div className="truncate text-xs text-muted-foreground">{RULESETS[room.rulesetId].name}</div></div>
        <div className="ml-auto flex items-center gap-2"><TurnTimer seconds={seconds} /><JButton variant="secondary" size="sm" className="h-10 bg-black/45" onClick={() => setChatOpen(true)} aria-label={t.chat}><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">{t.chat}</span></JButton><JButton variant="outlineGold" size="sm" className="h-10 bg-black/45" onClick={() => setScoreOpen(true)} aria-label={t.score} title={t.score}><Trophy className="h-4 w-4" /><span className="hidden sm:inline">{t.score}</span></JButton><JButton variant="outlineGold" size="sm" className="h-10 bg-black/45" onClick={toggleFullscreen} aria-label={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"} title={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}<span className="hidden md:inline">{fullscreen ? "Έξοδος" : "Πλήρης οθόνη"}</span></JButton></div>
      </header>

      <main className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center px-1 pb-1 sm:px-5">
        <div className="joker-table relative h-[min(66vh,46rem)] w-[min(96vw,70rem)]">
          <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[22%]">{seatBlock(2, "horizontal")}</div>
          <div className="absolute left-0 top-1/2 z-20 -translate-x-[12%] -translate-y-1/2">{seatBlock(1, "vertical")}</div>
          <div className="absolute right-0 top-1/2 z-20 translate-x-[12%] -translate-y-1/2">{seatBlock(3, "vertical")}</div>
          <div className="pointer-events-none absolute inset-[13%] rounded-[50%] border border-felt-line/60" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="select-none text-center font-display text-4xl font-black tracking-[0.12em] text-primary/10 sm:text-7xl"><div className="text-5xl sm:text-8xl">♛</div>JOKER</div></div>
          <div className="absolute inset-0 flex items-center justify-center [--card-w:3.4rem] sm:[--card-w:4.6rem]">{demo.trick.map((p) => <div key={p.card.id} className={cn("animate-card-drop absolute", TRICK_OFFSET[posOf(p.seatIndex)])}><PlayingCard card={p.card} /></div>)}</div>
        </div>
      </main>

      <footer className="relative z-30 flex flex-col items-center px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))]">
        <div className="-mb-1 flex w-full max-w-3xl items-end justify-center gap-3">
          <div className="flex justify-center overflow-visible pt-4 [--card-w:clamp(3.5rem,11.5vw,5.7rem)] landscape:max-sm:[--card-w:3.2rem]">{demo.hand.map((c, i) => <div key={c.id} className={cn(i > 0 && "-ml-[calc(var(--card-w)*0.42)] sm:-ml-[calc(var(--card-w)*0.25)]")} style={{ zIndex: i }}><PlayingCard card={c} selected={demo.selectedId === c.id} onClick={isMyTurn ? () => demo.toggleSelect(c.id) : undefined} /></div>)}</div>
          <JButton size="md" className="mb-3 shrink-0" disabled={!demo.selectedId || !isMyTurn} onClick={demo.playSelected}>{t.playCard}</JButton>
        </div>
        <div className="mt-1">{seatBlock(0, "horizontal")}</div>
      </footer>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} recipients={[...[1,2,3].map((p) => ({ value: seatAt(p as Pos), label: nameAt(seatAt(p as Pos)) })), { value: "all" as const, label: t.everyone }]} onSend={(to, text) => channel.send({ fromSeat: localSeat, to, text })} />
      <Scoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} sheet={demo.sheet} />
    </div>
  );
}
