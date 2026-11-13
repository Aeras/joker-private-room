import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
import { createTapTracker, tapActivationHandlers } from "./tapActivation";
import type { Suit } from "@/domain/cards";
import type { LocalLegalAction } from "@/domain/projection";

type JokerOption = Extract<LocalLegalAction, { type: "choose_joker_semantic" }>["options"][number];

const SUIT_META: Record<Suit, { symbol: string; label: string; border: string; gradId: string }> = {
  hearts: { symbol: "♥", label: "κούπες", border: "rgba(239, 68, 68, 0.45)", gradId: "jokerHeartGrad" },
  diamonds: { symbol: "♦", label: "καρό", border: "rgba(239, 68, 68, 0.45)", gradId: "jokerDiamondGrad" },
  clubs: { symbol: "♣", label: "σπαθιά", border: "rgba(212, 175, 55, 0.4)", gradId: "jokerClubGrad" },
  spades: { symbol: "♠", label: "μπαστούνια", border: "rgba(212, 175, 55, 0.4)", gradId: "jokerSpadeGrad" },
};

const SUIT_PATHS: Record<Suit, string> = {
  hearts: "M32 54C26 48 8 35 8 21C8 8 24 6 32 18C40 6 56 8 56 21C56 35 38 48 32 54Z",
  diamonds: "M32 6L51 32L32 58L13 32Z",
  clubs: "M32 8C19 8 17 22 23 28C9 22 4 39 14 45C20 49 27 45 30 40C30 47 27 52 23 56H41C37 52 34 47 34 40C37 45 44 49 50 45C60 39 55 22 41 28C47 22 45 8 32 8Z",
  spades: "M32 6C27 15 9 27 9 38C9 50 25 51 30 40C30 47 27 52 23 56H41C37 52 34 47 34 40C39 51 55 50 55 38C55 27 37 15 32 6Z",
};

const SUIT_ORDER: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

const CENTER_PANEL =
  "fixed left-1/2 top-1/2 z-[85] -translate-x-1/2 -translate-y-1/2 pointer-events-auto select-none";

export function JokerChoicePicker({
  options,
  busy,
  trumpSuit,
  onSelect,
  onDismiss,
}: {
  options: readonly JokerOption[];
  busy: boolean;
  trumpSuit?: Suit | null;
  onSelect: (option: JokerOption) => void;
  onDismiss?: (() => void) | undefined;
}) {
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  const tracker = useRef(createTapTracker()).current;
  // Portal into the fullscreen root (document.body is not rendered while an
  // element is fullscreen) so no table stacking context can sit above the chooser.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPortalTarget(document.getElementById("table-fullscreen-root") ?? document.body);
    recordTimingDiagnostic("joker_choice_open", { dismissible: Boolean(onDismiss) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (option: JokerOption | undefined, label: string) =>
    tapActivationHandlers<HTMLButtonElement>(
      tracker,
      () => {
        if (option) onSelect(option);
      },
      label,
      { isDisabled: () => busy || !option },
    );
  const consume = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const dismiss = onDismiss
    ? tapActivationHandlers<HTMLDivElement>(tracker, onDismiss, "outside", {
        swallowFollowingClick: true,
      })
    : null;
  // Transparent, undimmed catcher: swallows the whole outside gesture so nothing underneath activates.
  const wrap = (panel: ReactNode) => {
    const content = !dismiss ? (
      panel
    ) : (
      <>
        <div
          aria-hidden="true"
          data-joker-choice-dismiss
          className="fixed inset-0 z-[84] pointer-events-auto touch-none"
          onPointerDown={(event) => {
            consume(event);
            dismiss.onPointerDown(event);
          }}
          onPointerUp={(event) => {
            consume(event);
            dismiss.onPointerUp(event);
          }}
          onPointerCancel={dismiss.onPointerCancel}
          onMouseDown={consume}
          onDoubleClick={consume}
          onClick={(event) => {
            consume(event);
            dismiss.onClick(event);
          }}
        />
        {panel}
      </>
    );
    return portalTarget
      ? createPortal(<div data-joker-choice-layer>{content}</div>, portalTarget)
      : null;
  };
  const leadOptions = options.filter((option) => option.context === "LEAD");
  const openTrickOptions = options.filter((option) => option.context === "OPEN_TRICK");

  if (leadOptions.length > 0) {
    const findLead = (mode: "HIGHER_SUIT" | "SUIT_WINS", suit: Suit) =>
      leadOptions.find(
        (option) =>
          option.context === "LEAD" && option.mode === mode && option.requestedSuit === suit,
      );

    const renderRow = (
      mode: "HIGHER_SUIT" | "SUIT_WINS",
      labelNode: ReactNode,
    ) => (
      <div className="joker-joker-lead-row grid grid-cols-[minmax(105px,1fr)_repeat(4,minmax(42px,48px))] items-center gap-1.5 sm:gap-2 py-0.5">
        <div className="flex items-center pl-1 text-left font-extrabold select-none">
          {labelNode}
        </div>
        {SUIT_ORDER.map((suit) => {
          const option = findLead(mode, suit);
          const meta = SUIT_META[suit];
          const isTrump = trumpSuit === suit;
          const actionLabel =
            mode === "HIGHER_SUIT" && isTrump
              ? "Θέλω μεγαλύτερο ατού"
              : mode === "HIGHER_SUIT"
                ? `Θέλω μεγαλύτερο ${meta.label}`
                : `Παίρνουν ${meta.label}`;

          return (
            <button
              key={`${mode}-${suit}`}
              type="button"
              disabled={busy || !option}
              aria-label={actionLabel}
              title={actionLabel}
              {...choose(option, `${mode}-${suit}`)}
              style={{ borderColor: isTrump ? "#eab308" : meta.border }}
              className={`group relative flex aspect-square h-11 w-11 sm:h-12 sm:w-12 touch-manipulation items-center justify-center rounded-[11px] border bg-gradient-to-b from-[#242921] via-[#121511] to-[#080a08] p-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_4px_10px_rgba(0,0,0,0.65)] transition-all duration-150 enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:hover:scale-105 enabled:hover:border-[#f3d470] enabled:hover:bg-gradient-to-b enabled:hover:from-[#323a2d] enabled:hover:via-[#1b2018] enabled:hover:to-[#0f120e] enabled:hover:shadow-[0_8px_18px_rgba(0,0,0,0.85),0_0_14px_rgba(243,212,112,0.45)] enabled:active:translate-y-0 enabled:active:scale-95 disabled:opacity-25 ${
                isTrump ? "ring-1 ring-amber-400/50 shadow-[0_0_10px_rgba(234,179,8,0.35)]" : ""
              }`}
            >
              {isTrump && (
                <span
                  className="pointer-events-none absolute -top-1.5 -right-1 z-10 flex items-center gap-0.5 rounded-full border border-amber-200 bg-gradient-to-b from-amber-200 to-amber-600 px-1 py-0.5 text-[6.5px] font-black leading-none text-black shadow-md"
                  aria-hidden="true"
                >
                  👑 ΑΤΟΥ
                </span>
              )}
              <div className="flex h-[60%] w-[60%] items-center justify-center drop-shadow-[0_3px_5px_rgba(0,0,0,0.8)] transition-transform duration-150 group-hover:scale-110">
                <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true" focusable="false">
                  <path
                    d={SUIT_PATHS[suit]}
                    fill={`url(#${meta.gradId})`}
                    stroke="#ffd700"
                    strokeWidth="1.2"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    );

    return wrap(
      <div className={CENTER_PANEL} data-joker-choice-position="table-center">
        <div className="relative w-fit max-w-[calc(100vw-1.5rem)] rounded-[22px] border-2 border-[#dfbc43] bg-[radial-gradient(circle_at_50%_15%,#1c241d_0%,#0c100d_80%,#060806_100%)] p-3.5 sm:p-4 text-center shadow-[0_26px_70px_rgba(0,0,0,0.95),inset_0_1px_2px_rgba(255,255,255,0.22),0_0_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
          {/* Corner filigree brackets */}
          <span className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 rounded-tl-sm border-l-2 border-t-2 border-[#e8c258]/80" aria-hidden="true" />
          <span className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 rounded-tr-sm border-r-2 border-t-2 border-[#e8c258]/80" aria-hidden="true" />
          <span className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 rounded-bl-sm border-b-2 border-l-2 border-[#e8c258]/80" aria-hidden="true" />
          <span className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 rounded-br-sm border-b-2 border-r-2 border-[#e8c258]/80" aria-hidden="true" />

          {/* Title */}
          <h2 className="mb-2.5 flex items-center justify-center gap-2 text-xs sm:text-[13px] font-extrabold uppercase tracking-[0.18em]">
            <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#e8c258]/60" />
            <span className="bg-gradient-to-b from-[#fffceb] via-[#e8c258] to-[#996e14] bg-clip-text text-transparent">
              Εντολή Τζόκερ
            </span>
            <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#e8c258]/60" />
          </h2>

          {/* SVG Gradient Definitions */}
          <svg className="sr-only" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id="jokerHeartGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#ff7b89" />
                <stop offset="50%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </radialGradient>
              <radialGradient id="jokerDiamondGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#ff9999" />
                <stop offset="50%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </radialGradient>
              <radialGradient id="jokerClubGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#8b949e" />
                <stop offset="55%" stopColor="#24292f" />
                <stop offset="100%" stopColor="#0a0c0f" />
              </radialGradient>
              <radialGradient id="jokerSpadeGrad" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stopColor="#8b949e" />
                <stop offset="55%" stopColor="#24292f" />
                <stop offset="100%" stopColor="#0a0c0f" />
              </radialGradient>
            </defs>
          </svg>

          {/* Unified 5-Column Grid Card */}
          <div className="flex flex-col gap-1.5 rounded-2xl border border-[#d4af37]/30 bg-black/55 p-2 sm:p-2.5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
            {renderRow(
              "HIGHER_SUIT",
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-amber-400">▲</span>
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] tracking-wider text-amber-400">ΘΕΛΩ</span>
                  <span className="text-xs font-black tracking-wide text-amber-100">ΜΕΓΑΛΥΤΕΡΟ</span>
                </div>
              </div>,
            )}

            {/* Subtle Divider */}
            <div className="h-[1px] w-full bg-gradient-to-r from-[#d4af37]/5 via-[#d4af37]/35 to-[#d4af37]/5" />

            {renderRow(
              "SUIT_WINS",
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-amber-400">👑</span>
                <span className="text-xs font-black tracking-wide text-amber-100">ΠΑΙΡΝΟΥΝ</span>
              </div>,
            )}
          </div>
        </div>
      </div>,
    );
  }

  if (openTrickOptions.length > 0) {
    const compete = openTrickOptions.find((option) => option.mode === "COMPETE");
    const fromBelow = openTrickOptions.find((option) => option.mode === "FROM_BELOW");

    return wrap(
      <div className={CENTER_PANEL} data-joker-choice-position="table-center">
        <div className="relative w-fit max-w-[calc(100vw-1.5rem)] rounded-[22px] border-2 border-[#dfbc43] bg-[radial-gradient(circle_at_50%_15%,#1c241d_0%,#0c100d_80%,#060806_100%)] p-3.5 sm:p-4 text-center shadow-[0_26px_70px_rgba(0,0,0,0.95),inset_0_1px_2px_rgba(255,255,255,0.22),0_0_35px_rgba(0,0,0,0.8)] backdrop-blur-md">
          {/* Corner filigree brackets */}
          <span className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 rounded-tl-sm border-l-2 border-t-2 border-[#e8c258]/80" aria-hidden="true" />
          <span className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 rounded-tr-sm border-r-2 border-t-2 border-[#e8c258]/80" aria-hidden="true" />
          <span className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 rounded-bl-sm border-b-2 border-l-2 border-[#e8c258]/80" aria-hidden="true" />
          <span className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 rounded-br-sm border-b-2 border-r-2 border-[#e8c258]/80" aria-hidden="true" />

          {/* Title */}
          <h2 className="mb-3 flex items-center justify-center gap-2 text-xs sm:text-[13px] font-extrabold uppercase tracking-[0.18em]">
            <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#e8c258]/60" />
            <span className="bg-gradient-to-b from-[#fffceb] via-[#e8c258] to-[#996e14] bg-clip-text text-transparent">
              Εντολή Τζόκερ
            </span>
            <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#e8c258]/60" />
          </h2>

          <div className="flex items-center justify-center gap-2.5 sm:gap-3">
            <button
              type="button"
              disabled={busy || !fromBelow}
              {...choose(fromBelow, "FROM_BELOW")}
              className="h-11 min-w-[8.5rem] sm:min-w-[9.5rem] touch-manipulation rounded-xl border border-[#b99a5d] bg-white bg-gradient-to-b from-white via-zinc-100 to-zinc-200 px-4 text-sm font-bold text-zinc-950 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[#e5c158] enabled:hover:shadow-[0_12px_24px_rgba(0,0,0,0.5)] enabled:active:translate-y-0 enabled:active:brightness-90 active:brightness-90 enabled:active:shadow-inner disabled:opacity-40"
            >
              Τζόκερ από κάτω
            </button>
            <button
              type="button"
              disabled={busy || !compete}
              {...choose(compete, "COMPETE")}
              className="h-11 min-w-[8.5rem] sm:min-w-[9.5rem] touch-manipulation rounded-xl border border-red-300/60 bg-red-600 bg-gradient-to-b from-red-500 via-red-600 to-red-700 px-4 text-sm font-bold text-white shadow-[0_8px_22px_rgba(185,28,28,0.38)] transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-red-200 enabled:hover:shadow-[0_12px_26px_rgba(220,38,38,0.5)] enabled:active:translate-y-0 enabled:active:brightness-90 active:brightness-90 enabled:active:shadow-inner disabled:opacity-40"
            >
              Τζόκερ από πάνω
            </button>
          </div>
        </div>
      </div>,
    );
  }

  return null;
}
