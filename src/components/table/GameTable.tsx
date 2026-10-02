import { Link } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

/** Relative position: 0 bottom (local), 1 left, 2 top, 3 right. */
type Pos = 0 | 1 | 2 | 3;
const TRICK_OFFSET: Record<Pos, string> = {
  0: "translate-y-[42%]",
  1: "-translate-x-[62%] -rotate-6",
  2: "-translate-y-[42%]",
  3: "translate-x-[62%] rotate-6",
};

export function GameTable({ room, localPlayerId }: { room: Room; localPlayerId: string }) {
  const localSeat = Math.max(
    0,
    room.seats.findIndex((s) => s.occupant.type === "human" && s.occupant.player.id === localPlayerId),
  );
  const demo = useDemoTable(room, localSeat);
  const seconds = useTurnTimer(TURN_DURATION_SECONDS, demo.turnKey, demo.activeSeat === localSeat);
  const [chatOpen, setChatOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);

  const channel = useMemo(() => createLocalEphemeralChannel(), []);
  const bubbles = useEphemeralBubbles(channel);
  const names = room.seats.map((s) => occupantName(s.occupant) ?? t.emptySeat);
  const seatAt = (pos: Pos) => (localSeat + pos) % SEAT_COUNT;
  const posOf = (seat: number) => ((seat - localSeat + SEAT_COUNT) % SEAT_COUNT) as Pos;

  // Demo: bots may reply with predefined lines (no LLM). Respects bot speech settings.
  useEffect(
    () =>
      channel.subscribe((m) => {
        if (m.fromSeat !== localSeat) return;
        const targets = m.to === "all" ? room.seats.map((s) => s.index) : [m.to];
        const bot = room.seats.find((s) => targets.includes(s.index) && s.occupant.type === "bot");
        if (!bot || bot.occupant.type !== "bot") return;
        const reply = pickBotReply(bot.occupant.bot.personalityId, room.botSettings, {
          type: "message_received",
          fromName: names[localSeat],
        });
        if (reply) setTimeout(() => channel.send({ fromSeat: bot.index, to: localSeat, text: reply }), 1200);
      }),
    [channel, room, localSeat, names],
  );

  const bubbleFor = (seat: number) => {
    const b = bubbles.find((x) => x.fromSeat === seat);
    if (!b) return null;
    return <SpeechBubble text={b.text} toLabel={b.to === "all" ? t.everyone : names[b.to]} />;
  };

  const seatBlock = (pos: Pos, orientation: "horizontal" | "vertical") => {
    const seat = seatAt(pos);
    return (
      <div className="relative flex flex-col items-center gap-1">
        {pos !== 2 && <div className="absolute bottom-full mb-1">{bubbleFor(seat)}</div>}
        <TableSeat seat={room.seats[seat]} stats={demo.seatStats(seat)} orientation={orientation} showCards={pos !== 0} />
        {pos === 2 && <div className="absolute top-full mt-1">{bubbleFor(seat)}</div>}
      </div>
    );
  };

  const isMyTurn = demo.activeSeat === localSeat;

  return (
    <div className="surface-wood flex h-dvh flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4">
        <Link to="/lobby" aria-label={t.back} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="hidden min-w-0 sm:block">
          <div className="font-display text-primary">JOKER</div>
          <div className="truncate text-xs text-muted-foreground">{RULESETS[room.rulesetId].name}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <TurnTimer seconds={seconds} />
          <JButton variant="secondary" size="sm" className="h-10" onClick={() => setChatOpen(true)} aria-label={t.chat}>
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t.chat}</span>
          </JButton>
          <JButton variant="outlineGold" size="sm" className="h-10" onClick={() => setScoreOpen(true)} aria-label={t.score} title={t.score}>
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">{t.score}</span>
          </JButton>
        </div>
      </header>

      {/* Felt */}
      <main className="surface-felt relative mx-1.5 grid min-h-0 flex-1 grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr] gap-1 rounded-[2rem] border-4 border-wood-deep p-2 shadow-[inset_0_0_60px_oklch(0_0_0/45%)] sm:mx-4 sm:p-4">
        <div className="col-span-3 flex justify-center">{seatBlock(2, "horizontal")}</div>
        <div className="flex items-center">{seatBlock(1, "vertical")}</div>
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-[8%] rounded-full border border-felt-line" />
          <div className="relative flex h-full max-h-60 w-full max-w-72 items-center justify-center [--card-w:3.4rem] sm:[--card-w:4.6rem]">
            {demo.trick.map((p) => (
              <div key={p.card.id} className={cn("animate-card-drop absolute", TRICK_OFFSET[posOf(p.seatIndex)])}>
                <PlayingCard card={p.card} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center">{seatBlock(3, "vertical")}</div>
      </main>

      {/* Local player area */}
      <footer className="flex flex-col items-center gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex w-full max-w-3xl items-center justify-between gap-2">
          {seatBlock(0, "horizontal")}
          <JButton size="md" disabled={!demo.selectedId || !isMyTurn} onClick={demo.playSelected}>
            {t.playCard}
          </JButton>
        </div>
        <div className="flex w-full justify-center overflow-visible pt-5 [--card-w:clamp(3.4rem,11.5vw,5.5rem)] landscape:max-sm:[--card-w:3.2rem]">
          {demo.hand.map((c, i) => (
            <div key={c.id} className={cn(i > 0 && "-ml-[calc(var(--card-w)*0.42)] sm:-ml-[calc(var(--card-w)*0.25)]")} style={{ zIndex: i }}>
              <PlayingCard card={c} selected={demo.selectedId === c.id} onClick={isMyTurn ? () => demo.toggleSelect(c.id) : undefined} />
            </div>
          ))}
        </div>
      </footer>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        recipients={[
          ...[1, 2, 3].map((p) => ({ value: seatAt(p as Pos), label: names[seatAt(p as Pos)] })),
          { value: "all" as const, label: t.everyone },
        ]}
        onSend={(to, text) => channel.send({ fromSeat: localSeat, to, text })}
      />
      <Scoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} sheet={demo.sheet} />
    </div>
  );
}
