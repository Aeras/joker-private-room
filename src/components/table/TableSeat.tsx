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
      text: `${tricksTaken} / —`,
      label: `${tricksTaken} μπάζες, δήλωση σε αναμονή`,
      marker: "",
      className: "text-foreground/80",
    };
  }
  if (tricksTaken === declaration) {
    return {
      text: `${tricksTaken} / ${declaration}`,
      label: `${tricksTaken} από ${declaration}, ακριβώς στη δήλωση`,
      marker: "✓",
      className: "text-emerald-300",
    };
  }
  if (tricksTaken > declaration) {
    return {
      text: `${tricksTaken} / ${declaration}`,
      label: `${tricksTaken} από ${declaration}, υπέρβαση δήλωσης`,
      marker: "!",
      className: "text-negative",
    };
  }
  return {
    text: `${tricksTaken} / ${declaration}`,
    label: `${tricksTaken} από ${declaration}, κάτω από τη δήλωση`,
    marker: "",
    className: "text-foreground/85",
  };
}

export function TableSeat({ seat, stats, orientation, showCards = true, local = false, infoLayout = "below" }: {
  seat: Seat;
  stats: SeatStats;
  orientation: "horizontal" | "vertical";
  showCards?: boolean;
  local?: boolean;
  infoLayout?: "below" | "left";
}) {
  const o = seat.occupant;
  const name = o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : t.emptySeat;
  const id = o.type === "human" ? o.player.id : o.type === "bot" ? o.bot.id : `empty-${seat.index}`;
  const explicitAvatar = o.type === "human" ? o.player.avatarUrl : o.type === "bot" ? o.bot.avatarUrl : undefined;
  const connected = o.type === "bot" || (o.type === "human" && o.connected);
  const score = stats.totalScore < 0 ? `−${Math.abs(stats.totalScore)}` : `${stats.totalScore}`;
  const progress = progressPresentation(stats.tricksTaken, stats.declaration);
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
        <PlayerAvatar
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
        />
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
    <div className={cn("relative flex flex-col items-center", stats.isActive && "drop-shadow-[0_0_10px_var(--gold)]")}>
      {avatar}
      <div data-seat-info-layout={infoLayout} className={cn(infoLayout === "left" ? "absolute right-full top-1/2 mr-2 -translate-y-1/2" : "-mt-1", "min-w-24 max-w-36 rounded-md border border-primary/40 bg-black/85 px-2 py-1 text-center shadow-lg backdrop-blur-sm", local && "min-w-28")}>
        <div className="truncate text-[10px] font-semibold leading-tight text-foreground sm:text-xs">
          {name}{local && <span className="text-primary"> · ΕΣΥ</span>}
        </div>
        <div className="mt-0.5 flex items-center justify-center gap-2 leading-tight">
          <span className={cn("joker-seat-score font-display text-xs font-bold tabular-nums sm:text-sm", stats.totalScore < 0 ? "text-negative" : "text-primary")} title="Συνολικό σκορ">
            {score}
          </span>
          <span className="text-white/30">·</span>
          <span className={cn("joker-seat-progress text-[10px] font-semibold tabular-nums sm:text-xs", progress.className)} aria-label={progress.label} title="Μπάζες / Δήλωση">
            {progress.text}{progress.marker && <span className="ml-1" aria-hidden="true">{progress.marker}</span>}
          </span>
        </div>
      </div>
    </div>
  );

  if (local) return identity;

  return (
    <div className={cn("flex items-center gap-1", orientation === "vertical" ? "flex-col" : "flex-row")}>
      {identity}
      {showCards && stats.cardCount > 0 && (
        <div className="flex -space-x-3 [--card-w:1.05rem] sm:[--card-w:1.35rem] lg:[--card-w:1.55rem]">
          {Array.from({ length: Math.min(stats.cardCount, 9) }, (_, i) => <PlayingCard key={i} faceDown />)}
        </div>
      )}
    </div>
  );
}
