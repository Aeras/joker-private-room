import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BiribaCard, BiribaMeld } from "./rules";
import { biribaMeldDirty } from "./rules";

const cardImage = (card: BiribaCard): string => card.joker
  ? "/cards/optimized-png/faces/joker_red.png"
  : `/cards/optimized-png/faces/${card.suit}_${({ 1: "ace", 11: "jack", 12: "queen", 13: "king" } as Record<number, string>)[card.rank] ?? card.rank}.png`;

const cardName = (card: BiribaCard): string => card.joker ? "Τζόκερ" : `${card.rank} ${card.suit}`;

export function BiribaMeldZone({ melds, teamName, hiddenCardIds, highlightedIndices }: { melds: BiribaMeld[]; teamName: string; hiddenCardIds?: ReadonlySet<string>; highlightedIndices?: ReadonlySet<number> | undefined }) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const swipeConsumed = useRef(false);
  const pages = Math.max(1, Math.ceil(melds.length / 6));
  const current = Math.min(page, pages - 1);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);
  const availablePages = new Set([...(highlightedIndices ?? [])].map(index => Math.floor(index / 6)));
  const availablePageKey = [...availablePages].sort((a, b) => a - b).join(",");
  // When a selection has valid targets only on a hidden page, show that page automatically.
  // Do not steal manual swipes if a target is already visible.
  useEffect(() => {
    if (!availablePageKey) return;
    const targetPages = availablePageKey.split(",").map(Number);
    setPage(previous => targetPages.includes(previous) ? previous : targetPages[0]!);
  }, [availablePageKey]);
  const active = expanded === null ? null : melds[expanded] ?? null;
  useEffect(() => {
    if (expanded === null) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const onSwipeEnd = (x: number, y: number) => {
    const from = swipeOrigin.current;
    swipeOrigin.current = null;
    if (!from || pages < 2) return;
    const dx = x - from.x;
    const dy = y - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 35) return;
    swipeConsumed.current = true;
    const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
    setPage(old => Math.max(0, Math.min(pages - 1, old + (delta < 0 ? 1 : -1))));
  };

  return <>
    <div className="biriba-meld-grid" aria-label={`Χεριές ${teamName}`}
      onTouchStart={e => { const t = e.touches[0]; if (t) { swipeOrigin.current = { x: t.clientX, y: t.clientY }; swipeConsumed.current = false; } }}
      onTouchEnd={e => { const t = e.changedTouches[0]; if (t) onSwipeEnd(t.clientX, t.clientY); }}
      onTouchCancel={() => { swipeOrigin.current = null; }}
      onWheel={e => { if (pages > 1 && Math.abs(e.deltaY) > 12) setPage(old => Math.max(0, Math.min(pages - 1, old + (e.deltaY > 0 ? 1 : -1)))); }}
    >
      {melds.slice(current * 6, current * 6 + 6).map((meld, index) => {
        const fullIndex = current * 6 + index;
        const dirty = biribaMeldDirty(meld);
        const available = highlightedIndices?.has(fullIndex) ?? false;
        const ordered = [...meld.cards].sort((a, b) => a.value - b.value);
        return <button type="button" key={fullIndex}
          className={`biriba-meld-slot ${dirty ? "biriba-meld-slot--dirty" : "biriba-meld-slot--clean"} ${available ? "biriba-meld-slot--available" : ""}`}
          aria-label={`${teamName}, χεριά ${fullIndex + 1}, ${dirty ? "βρώμικη" : "καθαρή"}, ${ordered.length} φύλλα.${available ? " Διαθέσιμη για κόλλημα." : ""} Πατήστε για όλα τα φύλλα.`}
          onClick={event => { if (swipeConsumed.current) { swipeConsumed.current = false; return; } const rect = event.currentTarget.getBoundingClientRect(); setAnchor({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, above: rect.top > window.innerHeight * 0.48 }); setExpanded(old => old === fullIndex ? null : fullIndex); }}>
          <span className="biriba-meld-stack">
            {ordered.map(({ card }, i) => {
              const last = ordered.length - 1;
              // Endpoints are visible in full. Interior cards are tightly stacked in the middle.
              const left = last === 0 ? 35 : i === 0 ? 0 : i === last ? 70 : 33 + 29 * ((i - 1) / Math.max(1, last - 1));
              return <img key={card.id} src={cardImage(card)} alt={cardName(card)}
                data-biriba-card-id={card.id}
                draggable={false} style={{ left: `${left}%`, zIndex: i + 1, visibility: hiddenCardIds?.has(card.id) ? "hidden" : "visible" }}
                className="biriba-meld-card"/>;
            })}
          </span>
          <span className="biriba-meld-number" aria-hidden="true">#{fullIndex + 1}</span>
        </button>;
      })}
    </div>
    {pages > 1 && <div className="biriba-meld-pager">
      <button type="button" disabled={current === 0} className={availablePages.has(current - 1) ? "biriba-meld-pager-target" : undefined} aria-label={`Προηγούμενες χεριές ${teamName}${availablePages.has(current - 1) ? ", διαθέσιμο κόλλημα" : ""}`} onClick={() => setPage(current - 1)}>‹</button>
      <span>{current + 1}/{pages}</span>
      <button type="button" disabled={current === pages - 1} className={availablePages.has(current + 1) ? "biriba-meld-pager-target" : undefined} aria-label={`Επόμενες χεριές ${teamName}${availablePages.has(current + 1) ? ", διαθέσιμο κόλλημα" : ""}`} onClick={() => setPage(current + 1)}>›</button>
    </div>}
    {active && anchor && typeof document !== "undefined" && createPortal(
      <div className="biriba-meld-popover-layer" onPointerDown={event => { if (event.target === event.currentTarget) setExpanded(null); }}>
        <section className={`biriba-meld-popover ${anchor.above ? "biriba-meld-popover--above" : "biriba-meld-popover--below"}`}
          style={{ left: `${Math.max(12, Math.min(window.innerWidth - 12, anchor.x))}px`, top: `${anchor.y}px` }}
          role="dialog" aria-label={`Χεριά ${teamName}`}>
          <div className="biriba-meld-popover-heading">{teamName} · Χεριά #{expanded! + 1} · {biribaMeldDirty(active) ? "Βρώμικη" : "Καθαρή"}</div>
          <div className="biriba-meld-popover-cards">
            {[...active.cards].sort((a,b)=>a.value-b.value).map(({card}) =>
              <img key={card.id} draggable={false} src={cardImage(card)} alt={cardName(card)}/>)}
          </div>
        </section>
      </div>, document.body)}

  </>;
}
