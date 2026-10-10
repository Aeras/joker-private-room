import { emojiUrl } from "./EmojiPicker";
import { useEffect, useState } from "react";
import { assets } from "@/assets/registry";
import type { Seat } from "@/domain/players";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "../joker/PlayerAvatar";
import { PlayingCard } from "../joker/PlayingCard";

const HUMAN_TURN_MS = 30_000;
const WARNING_FRACTION = 0.5;
const DANGER_FRACTION = 0.2;

export interface SeatStats {
  totalScore: number;
  declaration: number | null;
  tricksTaken: number;
  isDealer: boolean;
  isActive: boolean;
  cardCount: number;
  humanDeadline?: string | null;
  isTemporarilyControlled?: boolean;
}

function turnRingColor(fraction: number): string {
  if (fraction <= DANGER_FRACTION) return "#ef4444";
  if (fraction <= WARNING_FRACTION) return "#f59e0b";
  return "#22c55e";
}

function progressPresentation(tricksTaken: number, declaration: number | null) {
  if (declaration === null) {
    return {
      text: `— / ${tricksTaken}`,
      label: `${tricksTaken} μπάζες, δήλωση σε αναμονή`,
      marker: "",
      className: "text-foreground/80",
    };
  }
  if (tricksTaken === declaration) {
    return {
      text: `${declaration} / ${tricksTaken}`,
      label: `${tricksTaken} από ${declaration}, ακριβώς στη δήλωση`,
      marker: "✓",
      className: "text-emerald-300",
    };
  }
  if (tricksTaken > declaration) {
    return {
      text: `${declaration} / ${tricksTaken}`,
      label: `${tricksTaken} από ${declaration}, υπέρβαση δήλωσης`,
      marker: "!",
      className: "text-negative",
    };
  }
  return {
    text: `${declaration} / ${tricksTaken}`,
    label: `${tricksTaken} από ${declaration}, κάτω από τη δήλωση`,
    marker: "",
    className: "text-foreground/85",
  };
}

export function TableSeat({ seat, stats, showCards = true, local = false, reactionEmoji, chatMessage, chatSide = "right", visualSeat = 2 }: {
  visualSeat?: 0 | 1 | 2 | 3;
  seat: Seat;
  stats: SeatStats;
  orientation: "horizontal" | "vertical";
  showCards?: boolean;
  local?: boolean;
  infoLayout?: "below" | "left";
  reactionEmoji?: string | null | undefined;
  chatMessage?: string | undefined;
  chatSide?: "left" | "right" | "above";
}) {
  const o = seat.occupant;
  const name = o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : t.emptySeat;
  const id = o.type === "human" ? o.player.id : o.type === "bot" ? o.bot.id : `empty-${seat.index}`;
  const explicitAvatar = o.type === "human" ? o.player.avatarUrl : o.type === "bot" ? o.bot.avatarUrl : undefined;
  const connected = o.type === "bot" || (o.type === "human" && o.connected);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!stats.isActive || !stats.humanDeadline) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [stats.humanDeadline, stats.isActive]);

  const deadlineMs = stats.humanDeadline ? Date.parse(stats.humanDeadline) : Number.NaN;
  const remainingMs = Number.isFinite(deadlineMs) ? Math.max(0, deadlineMs - now) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const ringFraction = Math.max(0, Math.min(1, remainingMs / HUMAN_TURN_MS));
  const elapsedFraction = 1 - ringFraction;
  const showCountdown = stats.isActive && Boolean(stats.humanDeadline) && Number.isFinite(deadlineMs);
  const ringColor = turnRingColor(ringFraction);
  const elapsedDegrees = elapsedFraction * 360;
  const avatarSize = local ? "h-14 w-14 sm:h-16 sm:w-16 lg:h-[4.5rem] lg:w-[4.5rem]" : "h-11 w-11 sm:h-14 sm:w-14 lg:h-16 lg:w-16";

  const avatar = (
    <div
      className={cn(
        "relative rounded-full shadow-xl",
        showCountdown ? "p-[4px]" : "p-[3px]",
        !showCountdown && "border border-primary/70 bg-black/70",
        stats.isActive && !showCountdown && "ring-2 ring-primary/75 drop-shadow-[0_0_10px_var(--gold)]",
      )}
      style={showCountdown ? {
        background: `conic-gradient(from 0deg, rgba(255,255,255,.14) 0deg ${elapsedDegrees}deg, ${ringColor} ${elapsedDegrees}deg 360deg)`,
        boxShadow: `0 0 12px ${ringColor}66`,
      } : undefined}
      aria-label={showCountdown ? `Ενεργός παίκτης, ${remainingSeconds} δευτερόλεπτα απομένουν` : stats.isActive ? "Ενεργός παίκτης" : undefined}
    >
      <div className="rounded-full bg-black p-0.5">
        {reactionEmoji && emojiUrl(reactionEmoji) ? (
          <div data-emoji-seat={seat.index} className={cn(avatarSize, "flex items-center justify-center overflow-hidden rounded-full bg-secondary")} role="img" aria-label="Smiley αντίδραση">
            <img src={emojiUrl(reactionEmoji)!} alt="" className="h-full w-full object-contain p-0.5" />
          </div>
        ) : <PlayerAvatar
          name={name}
          isBot={o.type === "bot"}
          imageUrl={assets.tableAvatar(explicitAvatar ?? assets.avatar(id, name))}
          fallbackImageUrl={explicitAvatar ?? assets.avatar(id, name)}
          size="lg"
          className={cn(
            avatarSize,
            local ? "joker-table-avatar-local" : "joker-table-avatar-remote",
            "border-0 transition-[filter,opacity] duration-200",
            stats.isTemporarilyControlled && "brightness-50 opacity-65 grayscale-[0.2]",
          )}
        />}
      </div>
      <span className={cn("joker-seat-connection absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-black", connected ? "bg-online" : "bg-muted-foreground")} aria-label={connected ? t.connected : t.disconnected} />
      {stats.isDealer && (
        <span title={t.dealer} aria-label={t.dealer} className="joker-seat-dealer absolute -left-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
          D
        </span>
      )}
      {showCountdown && (
        <span className="joker-seat-countdown absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/90 px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums" style={{ color: ringColor }} aria-hidden="true">
          {remainingSeconds}
        </span>
      )}
    </div>
  );

  const identity = (
    <div className={cn("joker-seat-identity relative flex items-center", "flex-col", stats.isActive && "drop-shadow-[0_0_10px_var(--gold)]")}>
      {avatar}
      {chatMessage && (
        <div role="status" data-chat-seat={seat.index}
          className={cn("pointer-events-none absolute z-[85] w-max max-w-[min(13rem,32vw)] break-words rounded-xl border border-primary/50 bg-black/90 px-2.5 py-1.5 text-center text-xs font-semibold leading-snug text-white shadow-xl",
            chatSide === "left" ? "right-[calc(100%+0.4rem)] top-1/2 -translate-y-1/2" :
            chatSide === "above" ? "bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2" :
            "left-[calc(100%+0.4rem)] top-1/2 -translate-y-1/2")}>
          {chatMessage}
        </div>
      )}
      {!local && <SeatSummary seat={seat} stats={stats} />}
    </div>
  );

  if (local) return identity;

  return (
    <div className="relative" data-visual-seat={visualSeat}>
      {identity}
      {showCards && stats.cardCount > 0 && (
        <div data-remote-hand={visualSeat} aria-label={`${stats.cardCount} κλειστά φύλλα`} className="joker-remote-hand pointer-events-none absolute" style={{ "--remote-card-count": Math.min(stats.cardCount, 9) } as React.CSSProperties}>
          {Array.from({ length: Math.min(stats.cardCount, 9) }, (_, i) => <div key={i} className="absolute" style={{ transform: visualSeat === 2 ? `translateX(${i * 10}%)` : `translateY(${i * 10 / 1.4}%) rotate(${visualSeat === 1 ? 90 : -90}deg)` }}><PlayingCard faceDown /></div>)}
        </div>
      )}
    </div>
  );
}

export function SeatSummary({ seat, stats, local = false }: { seat: Seat; stats: SeatStats; local?: boolean }) {
  const o = seat.occupant;
  const name = o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : t.emptySeat;
  const score = stats.totalScore < 0 ? `−${Math.abs(stats.totalScore)}` : `${stats.totalScore}`;
  const progress = progressPresentation(stats.tricksTaken, stats.declaration);
  return (
      <div data-seat-info-layout="below" className={cn("joker-seat-info text-center", local && "joker-seat-info-local")}>
        <div className="joker-seat-name-score flex items-baseline justify-center gap-1.5 text-xs font-semibold leading-tight text-white/85">
          <span className="joker-seat-name truncate" title={name}>{name}{local && <span className="sr-only"> · ΕΣΥ</span>}</span>
          <span className={cn("joker-seat-score shrink-0 font-bold tabular-nums", stats.totalScore < 0 ? "text-negative" : "text-white/65")} title="Συνολικό σκορ">{score}</span>
        </div>
        <span className={cn("joker-seat-progress inline-block rounded-md bg-black/20 px-2 py-0.5 text-xs font-semibold tabular-nums", progress.className)} aria-label={progress.label} title="Δήλωση / Μπάζες">
          {progress.text}{progress.marker && <span className="ml-1" aria-hidden="true">{progress.marker}</span>}
        </span>
      </div>
  );
}
