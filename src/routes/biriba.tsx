import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesColumn, ChevronDown, X } from "lucide-react";
import { CANONICAL_BOTS } from "../../supabase/functions/_shared/bot-catalog";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { PlayerAvatar } from "@/components/joker/PlayerAvatar";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { BiribaPixiPreview, BIRIBA_DEAL_BEAT_MS } from "@/biriba/BiribaPixiPreview";
import { BiribaRoomControls } from "@/biriba/BiribaRoomControls";
import { BiribaTrumpIndicator } from "@/biriba/BiribaTrumpIndicator";
import "@/biriba/biribaReferenceTable.css";
import {
  biribaCommand,
  type BiribaRoomView,
  type BiribaGameView,
  type BiribaResponse,
} from "@/services/biribaFunctions";
import {
  BIRIBA_TARGETS,
  DEFAULT_BIRIBA_TARGET,
  type BiribaCard,
  type BiribaMeld,
  type BiribaSeatCount,
  type BiribaTarget,
  biribaMeldValid,
  biribaTeamOf,
} from "@/biriba/rules";
import { assets } from "@/assets/registry";
import {
  NORMAL_DEAL_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_TRAVEL_MS,
} from "@/components/table/presentationTiming";

export const Route = createFileRoute("/biriba")({
  head: () => ({ meta: [{ title: "ΜΠΙΡΙΜΠΑ — Online παιχνίδι" }] }),
  component: BiribaHome,
});

function BiribaHome() {
  return (
    <PlayerSessionGate allowLogout={false} hideConnectedBanner>
      {(player) => <BiribaContent playerId={player.id} />}
    </PlayerSessionGate>
  );
}

const ranks: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
const names: Record<string, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };

const botAvatars: Record<string, string> = {
  "giorgos-nousios": "/avatars/giorgos_nousios.png",
  thomoulis: "/avatars/thomoulis.png",
  "theia-tamara": "/avatars/theia_tamara.png",
  mounara: "/avatars/mounara.png",
  "ka-monika": "/avatars/ka_monika.png",
  archimandritis: "/avatars/archimandritis.png",
};

const biribaAvatar = (seat: { name: string | null; botId?: string | null } | undefined) => {
  const url = (seat?.botId ? botAvatars[seat.botId] : undefined) ?? assets.avatar("", seat?.name ?? "");
  return assets.tableAvatar(url);
};

const label = (c: BiribaCard) => (c.joker ? "JOKER" : (ranks[c.rank] ?? c.rank) + (names[c.suit] ?? ""));

const format = (r: BiribaResponse) =>
  r.ok
    ? ""
    : ({
        ACTIVE_GAME_EXISTS: "Έχεις ήδη άλλο ενεργό παιχνίδι. Ολοκλήρωσέ το πρώτα.",
        ROOM_NOT_FOUND: "Το δωμάτιο δεν βρέθηκε.",
        ROOM_FULL: "Το δωμάτιο είναι γεμάτο.",
        HOST_ONLY: "Η ενέργεια επιτρέπεται μόνο στον δημιουργό.",
        ILLEGAL_MOVE: "Μη επιτρεπτή κίνηση.",
        SERVICE_UNAVAILABLE: "Ο διακομιστής Μπιρίμπας δεν είναι διαθέσιμος ακόμη.",
        NOT_AUTHENTICATED: "Χρειάζεται νέα σύνδεση.",
      } as Record<string, string>)[r.code] ?? "Η ενέργεια δεν ολοκληρώθηκε.";

function selectedMeld(cards: BiribaCard[], seat: number): BiribaMeld | null {
  if (cards.length < 3 || cards.some((c) => c.joker)) return null;
  const natural = cards as Array<Extract<BiribaCard, { joker?: false }>>;
  const suit = natural[0]!.suit;
  if (natural.some((c) => c.suit !== suit)) return null;
  const ordered = [...natural].sort((a, b) => a.rank - b.rank);
  if (!ordered.every((c, i) => i === 0 || c.rank === ordered[i - 1]!.rank + 1)) return null;
  return { ownerSeat: seat, suit, highAce: false, cards: ordered.map((c) => ({ card: c, value: c.rank })) };
}

function legalExtension(meld: BiribaMeld, cards: BiribaCard[]): BiribaMeld | null {
  if (cards.length !== 1 || cards[0]?.joker) return null;
  const card = cards[0] as Extract<BiribaCard, { joker?: false }>;
  if (card.suit !== meld.suit) return null;
  const first = meld.cards[0]?.value,
    last = meld.cards[meld.cards.length - 1]?.value;
  const proposal =
    card.rank === Number(first) - 1
      ? { ...meld, cards: [{ card, value: card.rank }, ...meld.cards] }
      : card.rank === Number(last) + 1
      ? { ...meld, cards: [...meld.cards, { card, value: card.rank }] }
      : null;
  return proposal && biribaMeldValid(proposal) ? proposal : null;
}

function BiribaContent({ playerId }: { playerId: string }) {
  const [capacity, setCapacity] = useState<BiribaSeatCount>(4);
  const [target, setTarget] = useState<BiribaTarget>(DEFAULT_BIRIBA_TARGET);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [room, setRoom] = useState<BiribaRoomView | null>(null);
  const [available, setAvailable] = useState<
    Array<{
      code: string;
      capacity: BiribaSeatCount;
      target: number;
      hostName: string;
      timerEnabled: boolean;
      occupied: number;
    }>
  >([]);
  const [game, setGame] = useState<BiribaGameView | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setClockNow(Date.now()), 350);
    return () => clearInterval(t);
  }, []);
  const [error, setError] = useState("");
  const [scoresOpen, setScoresOpen] = useState(false);
  const closedCodes = useRef(new Set<string>());
  const [picker, setPicker] = useState<"players" | "target" | null>(null);
  const [botSeatPicker, setBotSeatPicker] = useState<number | null>(null);
  const [dealShownKey, setDealShownKey] = useState<string | null>(null);
  const dealKey = game ? `${game.roundNumber}:${game.seat}` : null;
  const initialDealView = useMemo(() => {
    if (!game) return null;
    return { key: dealKey, game };
  }, [dealKey]);
  const onDealComplete = useCallback((key: string) => setDealShownKey(key), []);

  useEffect(() => {
    if (!dealKey || !game) return;
    const t = setTimeout(
      () => setDealShownKey(dealKey),
      (11 * game.seats - 1) * BIRIBA_DEAL_BEAT_MS + NORMAL_DEAL_TRAVEL_MS + NORMAL_DEAL_HANDOFF_TRAVEL_MS + 800
    );
    return () => clearTimeout(t);
  }, [dealKey, game?.seats]);

  const isHost = room?.hostPlayerId === playerId;
  const run = useCallback(
    async (data: Parameters<typeof biribaCommand>[0]["data"]) => {
      setBusy(true);
      setError("");
      try {
        const r = await biribaCommand({ data });
        if (!r.ok) {
          setError(format(r));
          return false;
        }
        if ("room" in r) {
          closedCodes.current.delete(r.room.code);
          setRoom(r.room);
          setGame(null);
          setDealShownKey(null);
        }
        if ("rooms" in r) setAvailable(r.rooms);
        if ("game" in r) setGame(r.game);
        if ("cancelled" in r) {
          if (data.code) closedCodes.current.add(data.code);
          setRoom(null);
          setGame(null);
          setDealShownKey(null);
          setMode("create");
        }
        if ("started" in r || "updated" in r) {
          if (room?.code) {
            const changed = await biribaCommand({ data: { action: "get", code: room.code } });
            if (changed.ok && "room" in changed) setRoom(changed.room);
          }
        }
        return true;
      } catch {
        setError("Δεν ήταν δυνατή η σύνδεση με τον server.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [room?.code]
  );

  useEffect(() => {
    let active = true;
    void biribaCommand({ data: { action: "membership" } })
      .then(async (r) => {
        if (!active || !r.ok || !("membership" in r) || !r.membership) return;
        const found = await biribaCommand({ data: { action: "get", code: r.membership.code } });
        if (active && found.ok && "room" in found) setRoom(found.room);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const code = room?.code;
  useEffect(() => {
    if (!code) return;
    let current = true;
    const poll = async () => {
      try {
        const result = await biribaCommand({ data: { action: "get", code } });
        if (!current || closedCodes.current.has(code)) return;
        if (!result.ok && result.code === "ROOM_NOT_FOUND") {
          setRoom(null);
          setGame(null);
          setMode("create");
          setBotSeatPicker(null);
          return;
        }
        if (result.ok && "room" in result && result.room.lifecycle === "finished") {
          const final = await biribaCommand({ data: { action: "get_game", code } });
          if (!current || closedCodes.current.has(code)) return;
          if (!final.ok || !("game" in final) || !final.game.matchFinished) {
            closedCodes.current.add(code);
            setRoom(null);
            setGame(null);
            setDealShownKey(null);
            setMode("create");
            return;
          }
          setRoom(result.room);
          setGame(final.game);
          return;
        }
        if (result.ok && "room" in result) setRoom((r) => (r?.version && r.version > result.room.version ? r : result.room));
        if (result.ok && "room" in result && result.room.lifecycle !== "waiting") {
          const next = await biribaCommand({ data: { action: "get_game", code } });
          if (current && !closedCodes.current.has(code) && next.ok && "game" in next) setGame((previous) => (previous?.revision === next.game.revision ? previous : next.game));
        }
      } catch {
        // A transient polling failure is retried on the next tick.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 900);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [code]);

  const ownCards = game?.myHand ?? [];
  const visualGame = dealShownKey === dealKey ? game : initialDealView?.game ?? game;
  const preview = useMemo(() => {
    if (!visualGame) return undefined;
    const hands: Array<BiribaCard[]> = Array.from({ length: visualGame.seats }, () => []);
    hands[0] = visualGame.myHand;
    return {
      seats: visualGame.seats,
      hands,
      packets: [[], []] as [BiribaCard[], BiribaCard[]],
      stock: [],
      discard: visualGame.discards,
      trump: visualGame.trump,
    };
  }, [visualGame]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));

  const play = async (move: unknown) => {
    if (!code) return;
    setError("");
    setBusy(true);
    try {
      const result = await biribaCommand({ data: { action: "move", code, move } });
      if (!result.ok) {
        setError(format(result));
        return;
      }
      if ("game" in result) {
        setGame(result.game);
        setSelected([]);
      }
    } catch {
      setError("Αποτυχία επικοινωνίας με τον server.");
    } finally {
      setBusy(false);
    }
  };

  const endGame = () => room ? run({ action: "end_game", code: room.code }) : Promise.resolve(false);

  if (room && room.lifecycle !== "waiting") {
    const mine =
      dealShownKey === dealKey &&
      game?.turn === game?.seat &&
      !game?.roundEnded &&
      !game?.clock.botTakeovers.includes(game?.seat ?? -1) &&
      game?.clock.pausedBy === null;
    const selectedCards = ownCards.filter((c) => selected.includes(c.id));
    const candidate = game ? selectedMeld(selectedCards, game.seat) : null;
    const pickup = game?.discards
      .map((discard) => ({ discard, meld: selectedMeld([...selectedCards, discard], game.seat) }))
      .find((item) => item.meld);
    const team = game ? biribaTeamOf(game.seat, game.seats) : null;
    const extensions =
      game?.melds
        .map((meld, index) => ({ index, kind: legalExtension(meld, selectedCards), ownerSeat: meld.ownerSeat }))
        .filter(
          (x) =>
            x.kind &&
            team === biribaTeamOf(x.ownerSeat, game.seats) &&
            (x.ownerSeat === game.seat || game.opened[game.seat])
        ) ?? [];

    const redTeamIndex = (room.code.charCodeAt(0) || 0) % 2;
    const redScore = game?.teamScores[redTeamIndex] ?? 0;
    const blueScore = game?.teamScores[1 - redTeamIndex] ?? 0;

    return (
      <main className="biriba-table-container">
        {/* Live reference table artwork */}


        {/* Dynamic Canvas Layer (Melds, Opponent Card Backs, Center Piles, Animations) */}
        <BiribaPixiPreview
          deal={preview}
          game={visualGame ?? undefined}
          revealComplete={dealShownKey === dealKey}
          onDealComplete={onDealComplete}
          redTeam={redTeamIndex}
        />

        {/* 1. MELD ZONES (ΚΟΚΚΙΝΗ ΟΜΑΔΑ & ΜΠΛΕ ΟΜΑΔΑ) */}
        <div className="biriba-team-zone biriba-team-zone--red">
          <div className="biriba-team-heading">
            <span>ΚΟΚΚΙΝΗ ΟΜΑΔΑ</span>
            <span className="biriba-team-score">{redScore}</span>
          </div>
        </div>

        <div className="biriba-team-zone biriba-team-zone--blue">
          <div className="biriba-team-heading">
            <span>ΜΠΛΕ ΟΜΑΔΑ</span>
            <span className="biriba-team-score">{blueScore}</span>
          </div>
        </div>

        {/* 2. LABELS FOR CENTRAL PILES */}
        <div className="biriba-pile-labels">
          <span className="biriba-pile-label">ΚΛΕΙΣΤΗ ΤΡΑΠΟΥΛΑ</span>
          <span className="biriba-pile-label">ΠΕΤΑΜΕΝΑ</span>
          <span className="biriba-pile-label">ΜΠΙΡΙΜΠΑΚΙ 1</span>
          <span className="biriba-pile-label">ΜΠΙΡΙΜΠΑΚΙ 2</span>
        </div>

        {/* 3. TRUMP (ΑΤΟΥ) INDICATOR */}
        <BiribaTrumpIndicator suit={visualGame?.trump ?? preview?.trump} />

        {/* 4. PLAYER AVATARS ANCHORED AROUND THE TABLE */}
        {/* Local Player (ΕΣΥ) */}
        <div className="biriba-seat biriba-seat--local">
          <div className="biriba-seat-avatar">
            <PlayerAvatar
              name={room.seats.find((seat) => seat.index === (game?.seat ?? 0))?.name ?? "ΕΣΥ"}
              imageUrl={biribaAvatar(room.seats.find((seat) => seat.index === (game?.seat ?? 0)))}
              size="lg"
            />
          </div>
          <span className="biriba-seat-name">ΕΣΥ</span>
        </div>

        {/* Teammate (ΣΥΜΠΑΙΚΤΗΣ) - Top Center */}
        {game && (
          <div className="biriba-seat biriba-seat--top">
            <div className="biriba-seat-avatar">
              <PlayerAvatar
                name={game.roomSeats[(game.seat + (game.seats === 2 ? 1 : 2)) % game.seats]?.name ?? "ΣΥΜΠΑΙΚΤΗΣ"}
                imageUrl={biribaAvatar(game.roomSeats[(game.seat + (game.seats === 2 ? 1 : 2)) % game.seats])}
                isBot={game.roomSeats[(game.seat + (game.seats === 2 ? 1 : 2)) % game.seats]?.occupant === "bot"}
                size="md"
              />
            </div>
            <span className="biriba-seat-name">
              {game.roomSeats[(game.seat + (game.seats === 2 ? 1 : 2)) % game.seats]?.name ?? (game.seats === 4 ? "ΣΥΜΠΑΙΚΤΗΣ" : "ΑΝΤΙΠΑΛΟΣ")}
            </span>
          </div>
        )}

        {/* Opponent Left (ΑΝΤΙΠΑΛΟΣ Α) */}
        {game && game.seats === 4 && (
          <div className="biriba-seat biriba-seat--left">
            <div className="biriba-seat-avatar">
              <PlayerAvatar
                name={game.roomSeats[(game.seat + 1) % game.seats]?.name ?? "ΑΝΤΙΠΑΛΟΣ Α"}
                imageUrl={biribaAvatar(game.roomSeats[(game.seat + 1) % game.seats])}
                isBot={game.roomSeats[(game.seat + 1) % game.seats]?.occupant === "bot"}
                size="md"
              />
            </div>
            <span className="biriba-seat-name">
              {game.roomSeats[(game.seat + 1) % game.seats]?.name ?? "ΑΝΤΙΠΑΛΟΣ Α"}
            </span>
          </div>
        )}

        {/* Opponent Right (ΑΝΤΙΠΑΛΟΣ Β) */}
        {game && game.seats === 4 && (
          <div className="biriba-seat biriba-seat--right">
            <div className="biriba-seat-avatar">
              <PlayerAvatar
                name={game.roomSeats[(game.seat + 3) % game.seats]?.name ?? "ΑΝΤΙΠΑΛΟΣ Β"}
                imageUrl={biribaAvatar(game.roomSeats[(game.seat + 3) % game.seats])}
                isBot={game.roomSeats[(game.seat + 3) % game.seats]?.occupant === "bot"}
                size="md"
              />
            </div>
            <span className="biriba-seat-name">
              {game.roomSeats[(game.seat + 3) % game.seats]?.name ?? "ΑΝΤΙΠΑΛΟΣ Β"}
            </span>
          </div>
        )}

        {/* 5. TOP BAR & UTILITIES */}
        <BiribaRoomControls isHost={isHost} busy={busy} error={error} onEndGame={endGame}>
          <button
            type="button"
            aria-label="Αναλυτική βαθμολογία"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-black/80 text-white shadow hover:bg-black"
            onClick={() => setScoresOpen((open) => !open)}
          >
            <ChartNoAxesColumn size={18} />
          </button>
        </BiribaRoomControls>

        {/* 6. TURN CONTROLS & ACTION BUTTONS */}
        <div className="biriba-actions text-white">
          {error && <p role="alert" className="mb-2 text-center text-xs font-semibold text-red-300 drop-shadow">{error}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            {mine && game?.phase === "draw" && (
              <button
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold shadow-lg hover:bg-emerald-500"
                disabled={busy}
                onClick={() => void play({ type: "draw" })}
              >
                Τράβηγμα
              </button>
            )}
            {mine && game?.phase === "draw" && pickup?.meld && (
              <button
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold shadow-lg hover:bg-amber-500"
                disabled={busy}
                onClick={() => void play({ type: "pickup", ids: [pickup.discard.id], meld: pickup.meld })}
              >
                Πάρε πεταμένα &amp; κατέβασε
              </button>
            )}
            {mine && game?.phase === "meld" && (
              <>
                <button
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold shadow-lg hover:bg-blue-500 disabled:opacity-40"
                  disabled={busy || !candidate}
                  onClick={() => candidate && void play({ type: "meld", meld: candidate })}
                >
                  Κατέβασμα επιλεγμένων
                </button>
                {extensions.map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold shadow hover:bg-amber-500"
                    onClick={() => item.kind && void play({ type: "extend", index: item.index, meld: item.kind })}
                  >
                    Κόλλημα #{item.index + 1}
                  </button>
                ))}
                <button
                  className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold shadow-lg hover:bg-rose-500 disabled:opacity-40"
                  disabled={busy || selected.length !== 1}
                  onClick={() => void play({ type: "discard", id: selected[0] })}
                >
                  Πέταγμα
                </button>
              </>
            )}
          </div>
        </div>

        {/* 7. PLAYER HAND (CURVED FAN LAYOUT) */}
        <div className="biriba-hand" style={{ "--biriba-card-gap": ownCards.length > 14 ? "clamp(-100px,-7.5vw,-48px)" : "clamp(-95px,-5.5vw,-42px)" } as React.CSSProperties}>
          {dealShownKey === dealKey &&
            ownCards.map((card, i) => {
              const total = ownCards.length;
              const mid = (total - 1) / 2;
              const norm = total > 1 ? (i - mid) / mid : 0;
              const rot = norm * 15;
              const yOffset = Math.pow(norm, 2) * 22;
              const isSelected = selected.includes(card.id);

              return (
                <button
                  type="button"
                  key={card.id}
                  disabled={!mine || busy}
                  aria-pressed={isSelected}
                  onClick={() => toggle(card.id)}
                  style={{
                    transform: `translateY(${yOffset - (isSelected ? 32 : 0)}px) rotate(${rot}deg)`,
                    zIndex: isSelected ? 60 : i + 1,
                  }}
                  className="biriba-fan-card"
                >
                  <img
                    draggable={false}
                    className="h-full w-full object-fill"
                    src={
                      card.joker
                        ? "/cards/optimized-png/faces/joker_red.png"
                        : `/cards/optimized-png/faces/${card.suit}_${
                            ({ 1: "ace", 11: "jack", 12: "queen", 13: "king" } as Record<number, string>)[card.rank] ?? card.rank
                          }.png`
                    }
                    alt={label(card)}
                  />
                </button>
              );
            })}
        </div>
        <div className="biriba-hand-lip" aria-hidden="true" />
      </main>
    );
  }

  return (
    <ScreenShell
      title="ΜΠΙΡΙΜΠΑ"
      variant="pregame"
      fixedViewport
      hideNavigation={Boolean(room)}
      contentClassName="!min-h-0 !overflow-hidden !py-1"
      headerActions={room ? <BiribaRoomControls isHost={isHost} busy={busy} error={error} onEndGame={endGame} /> : undefined}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 rounded-xl border border-primary/25 p-2">
        {error && <p role="alert" className="text-red-400">{error}</p>}
        {!room && (
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-lg border p-3 font-semibold" type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>
              Δημιουργία
            </button>
            <button
              className="rounded-lg border p-3 font-semibold"
              type="button"
              aria-pressed={mode === "join"}
              onClick={() => {
                setMode("join");
                void run({ action: "list" });
              }}
            >
              Συμμετοχή
            </button>
          </div>
        )}
        {room ? (
          <section className="flex min-h-0 flex-col gap-2">
            <p className="text-center text-sm text-muted-foreground">
              {room.capacity} παίκτες · {room.target.toLocaleString("el-GR")} πόντοι · Χρονόμετρο {room.timerEnabled ? "ON" : "OFF"}
            </p>
            <div className={`grid min-h-0 gap-2 ${room.capacity === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
              {room.seats.map((seat) => {
                const bot = CANONICAL_BOTS.find((b) => b.id === seat.botId);
                const canManage = isHost && seat.occupant !== "human";
                const content = (
                  <>
                    {seat.occupant === "empty" ? (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full sm:h-14 sm:w-14 border border-dashed border-primary/50 text-3xl text-primary">+</span>
                    ) : (
                      <PlayerAvatar
                        name={seat.name ?? "Παίκτης"}
                        imageUrl={assets.tableAvatar(bot?.avatarUrl ?? assets.avatar("", seat.name ?? ""))}
                        isBot={seat.occupant === "bot"}
                        size="lg"
                      />
                    )}
                    <span className="max-w-full truncate text-[10px] font-semibold sm:text-sm">{seat.name ?? "Κενή θέση"}</span>
                    {canManage && <span className="hidden text-xs text-muted-foreground sm:block">{seat.occupant === "bot" ? "Αλλαγή bot" : "Επιλογή bot"}</span>}
                  </>
                );
                return canManage ? (
                  <button
                    type="button"
                    key={seat.index}
                    disabled={busy}
                    onClick={() => setBotSeatPicker(seat.index)}
                    className="flex h-[clamp(96px,29dvh,175px)] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-primary/40 bg-secondary/30 p-1.5 sm:p-3 hover:border-primary/70 disabled:opacity-50"
                  >
                    {content}
                  </button>
                ) : (
                  <div key={seat.index} className="flex h-[clamp(96px,29dvh,175px)] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-secondary/30 p-1.5 sm:p-3">
                    {content}
                  </div>
                );
              })}
            </div>
            {botSeatPicker !== null && isHost && (() => {
              const chosen = room.seats.find((seat) => seat.index === botSeatPicker);
              if (!chosen || chosen.occupant === "human") return null;
              return (
                <div
                  className="pregame-modal-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3"
                  role="presentation"
                  onMouseDown={(e) => {
                    if (e.currentTarget === e.target) setBotSeatPicker(null);
                  }}
                >
                  <div
                    className="pregame-bot-modal max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-primary/40 bg-background p-4 shadow-2xl"
                    role="dialog"
                    aria-modal="true"
                    aria-label={"Επιλογή bot για θέση " + (botSeatPicker + 1)}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <strong>Επιλογή bot · Θέση {botSeatPicker + 1}</strong>
                      <button type="button" aria-label="Κλείσιμο" onClick={() => setBotSeatPicker(null)}>
                        <X size={20} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CANONICAL_BOTS.map((bot) => {
                        const used = room.seats.some((s) => s.index !== botSeatPicker && s.botId === bot.id);
                        return (
                          <button
                            type="button"
                            key={bot.id}
                            disabled={busy || used}
                            onClick={async () => {
                              await run({ action: "bot_add", code: room.code, seat: botSeatPicker, botId: bot.id });
                              setBotSeatPicker(null);
                            }}
                            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-primary/30 p-2 disabled:opacity-35"
                          >
                            <PlayerAvatar name={bot.displayName} imageUrl={assets.tableAvatar(bot.avatarUrl)} isBot size="md" />
                            <span className="text-center text-xs">{bot.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                    {chosen.occupant === "bot" && (
                      <button
                        type="button"
                        className="mt-3 rounded-lg border border-primary/50 px-4 py-2 text-sm"
                        disabled={busy}
                        onClick={async () => {
                          await run({ action: "bot_remove", code: room.code, seat: botSeatPicker });
                          setBotSeatPicker(null);
                        }}
                      >
                        Αφαίρεση bot
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-center gap-2">
              {isHost && (
                <button type="button" disabled={busy} className="rounded-lg bg-primary/25 px-4 py-2 text-sm font-semibold" onClick={() => void run({ action: "start", code: room.code })}>
                  Έναρξη παιχνιδιού
                </button>
              )}
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" disabled={busy} onClick={() => void run({ action: "leave", code: room.code })}>
                Έξοδος
              </button>
            </div>
          </section>
        ) : mode === "create" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_auto] items-end gap-2">
              <div className="relative min-w-0 text-xs sm:text-sm">
                <span>Παίκτες</span>
                <button type="button" aria-label="Παίκτες" aria-expanded={picker === "players"} onClick={() => setPicker((p) => (p === "players" ? null : "players"))} className="mt-1 flex w-full items-center justify-between gap-1 rounded bg-secondary px-2 py-3 text-sm">
                  {capacity}
                  <ChevronDown size={16} />
                </button>
                {picker === "players" && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-primary/40 bg-background p-1 shadow-xl">
                    {([2, 4] as const).map((n) => (
                      <button type="button" key={n} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-secondary" aria-selected={capacity === n} onClick={() => { setCapacity(n); setPicker(null); }}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative min-w-0 text-xs sm:text-sm">
                <span>Στόχος</span>
                <button type="button" aria-label="Στόχος" aria-expanded={picker === "target"} onClick={() => setPicker((p) => (p === "target" ? null : "target"))} className="mt-1 flex w-full items-center justify-between gap-1 rounded bg-secondary px-2 py-3 text-sm">
                  {target.toLocaleString("el-GR")}
                  <ChevronDown size={16} />
                </button>
                {picker === "target" && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-primary/40 bg-background p-1 shadow-xl">
                    {BIRIBA_TARGETS.map((n) => (
                      <button type="button" key={n} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-secondary" aria-selected={target === n} onClick={() => { setTarget(n); setPicker(null); }}>
                        {n.toLocaleString("el-GR")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="flex min-w-[85px] cursor-pointer flex-col items-center gap-2 text-center text-xs sm:text-sm">
                Χρονόμετρο
                <span className="relative inline-flex h-6 w-11 items-center">
                  <input type="checkbox" role="switch" aria-label="Χρονόμετρο" checked={timerEnabled} onChange={(e) => setTimerEnabled(e.target.checked)} className="peer sr-only" />
                  <span className="absolute inset-0 rounded-full bg-zinc-600 transition-colors peer-checked:bg-emerald-600" />
                  <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {timerEnabled
                ? "60 δευτερόλεπτα ανά πραγματικό παίκτη, με 3 προσωπικές παύσεις και προσωρινό bot στη λήξη."
                : "Απεριόριστος χρόνος για πραγματικούς παίκτες, χωρίς χρονόμετρο ή αυτόματο bot λόγω καθυστέρησης."}
            </p>
            <button type="button" disabled={busy} onClick={() => void run({ action: "create", capacity, target, timerEnabled })} className="w-full rounded-lg bg-primary py-3 font-bold text-primary-foreground">
              Δημιουργία δωματίου
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {available.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Δεν βρέθηκαν ενεργά δωμάτια. Δημιούργησε ένα νέο!</p>
            ) : (
              <div className="space-y-2">
                {available.map((r) => (
                  <div key={r.code} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <strong>{r.code}</strong> · {r.occupied}/{r.capacity} · {r.target.toLocaleString("el-GR")} πόντοι
                    </div>
                    <button type="button" disabled={busy} onClick={() => void run({ action: "join", code: r.code })} className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground">
                      Συμμετοχή
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ScreenShell>
  );
}
