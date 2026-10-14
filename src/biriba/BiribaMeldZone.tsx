import { useEffect, useState } from "react";
import type { BiribaCard, BiribaMeld } from "./rules";
import { biribaMeldDirty } from "./rules";

const cardImage = (card: BiribaCard): string => card.joker
  ? "/cards/optimized-png/faces/joker_red.png"
  : `/cards/optimized-png/faces/${card.suit}_${({ 1: "ace", 11: "jack", 12: "queen", 13: "king" } as Record<number, string>)[card.rank] ?? card.rank}.png`;

const cardName = (card: BiribaCard): string => card.joker ? "Τζόκερ" : `${card.rank} ${card.suit}`;

export function BiribaMeldZone({ melds, teamName }: { melds: BiribaMeld[]; teamName: string }) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const pages = Math.max(1, Math.ceil(melds.length / 6));
  const current = Math.min(page, pages - 1);
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);
  const active = expanded === null ? null : melds[expanded] ?? null;

  return <>
    <div className="biriba-meld-grid" aria-label={`Χεριές ${teamName}`}>
      {melds.slice(current * 6, current * 6 + 6).map((meld, index) => {
        const fullIndex = current * 6 + index;
        const dirty = biribaMeldDirty(meld);
        const ordered = [...meld.cards].sort((a, b) => a.value - b.value);
        return <button type="button" key={meld.cards.map(p => p.card.id).join(":")}
          className={`biriba-meld-slot ${dirty ? "biriba-meld-slot--dirty" : "biriba-meld-slot--clean"}`}
          aria-label={`${teamName}, χεριά ${fullIndex + 1}, ${dirty ? "βρώμικη" : "καθαρή"}, ${ordered.length} φύλλα. Πατήστε για όλα τα φύλλα.`}
          onClick={() => setExpanded(fullIndex)}>
          <span className="biriba-meld-stack">
            {ordered.map(({ card }, i) => {
              const last = ordered.length - 1;
              // Endpoints are visible in full. Interior cards are tightly stacked in the middle.
              const left = last === 0 ? 35 : i === 0 ? 0 : i === last ? 70 : 33 + 29 * ((i - 1) / Math.max(1, last - 1));
              return <img key={card.id} src={cardImage(card)} alt={cardName(card)}
                draggable={false} style={{ left: `${left}%`, zIndex: i + 1 }}
                className="biriba-meld-card"/>;
            })}
          </span>
        </button>;
      })}
    </div>
    {pages > 1 && <div className="biriba-meld-pager">
      <button type="button" disabled={current === 0} aria-label={`Προηγούμενες χεριές ${teamName}`} onClick={() => setPage(current - 1)}>‹</button>
      <span>{current + 1}/{pages}</span>
      <button type="button" disabled={current === pages - 1} aria-label={`Επόμενες χεριές ${teamName}`} onClick={() => setPage(current + 1)}>›</button>
    </div>}
    {active && <div className="biriba-meld-preview-backdrop" role="presentation" onClick={() => setExpanded(null)}>
      <section className="biriba-meld-preview" role="dialog" aria-modal="true" aria-label={`Αναλυτική προβολή χεριάς ${teamName}`} onClick={event => event.stopPropagation()}>
        <div className="biriba-meld-preview-header">
          <strong>{teamName} · {biribaMeldDirty(active) ? "Βρώμικη" : "Καθαρή"} χεριά</strong>
          <button type="button" onClick={() => setExpanded(null)} aria-label="Κλείσιμο χεριάς">✕</button>
        </div>
        <div className="biriba-meld-preview-cards">
          {[...active.cards].sort((a,b)=>a.value-b.value).map(({card}) =>
            <img key={card.id} draggable={false} src={cardImage(card)} alt={cardName(card)}/>)}
        </div>
      </section>
    </div>}
  </>;
}
