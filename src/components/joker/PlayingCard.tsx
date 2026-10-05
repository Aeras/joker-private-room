import { useEffect, useState, type ReactNode } from "react";
import { assets } from "@/assets/registry";
import {
  hasCardAssetFailed,
  isCardAssetReady,
  preloadCardAsset,
} from "@/assets/cardPreload";
import { cardLabel, isRedSuit, SUIT_SYMBOL, type Card } from "@/domain/cards";
import { cn } from "@/lib/utils";

/**
 * Playing card surface. Canonical artwork is preloaded and shown consistently.
 * The semantic face is reserved for a real artwork failure instead of flashing
 * while the PNG is still decoding/loading.
 * Size is controlled by the --card-w CSS variable on a parent or via className.
 */
export function PlayingCard({
  card,
  faceDown,
  selected,
  onClick,
  className,
}: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: (() => void) | undefined;
  className?: string;
}) {
  const base = cn(
    "relative aspect-[5/7] w-[var(--card-w,4.5rem)] shrink-0 rounded-[0.5rem] shadow-card transition-transform duration-150",
    onClick && "cursor-pointer",
    selected && "-translate-y-4 ring-gold",
    className,
  );

  if (faceDown || !card) {
    const back = assets.cardBack;
    return (
      <div className={cn(base, "overflow-hidden border border-primary/30 bg-card-face")} aria-label="Κλειστό φύλλο">
        {back ? (
          <CardArtwork artwork={back} alt="" fallback={<div className="card-back-pattern absolute inset-[3px] rounded-[0.35rem]" />} />
        ) : (
          <div className="card-back-pattern absolute inset-[3px] rounded-[0.35rem]" />
        )}
      </div>
    );
  }

  const face = assets.cardFace(card);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      aria-label={cardLabel(card)}
      className={cn(base, "overflow-hidden bg-card-face text-card-ink")}
    >
      <CardFace card={card} artwork={face} />
    </Tag>
  );
}

function CardArtwork({
  artwork,
  alt,
  fallback,
}: {
  artwork: string;
  alt: string;
  fallback: ReactNode;
}) {
  const [loaded, setLoaded] = useState(() => isCardAssetReady(artwork));
  const [failed, setFailed] = useState(() => hasCardAssetFailed(artwork));

  useEffect(() => {
    setLoaded(isCardAssetReady(artwork));
    setFailed(hasCardAssetFailed(artwork));
    if (isCardAssetReady(artwork) || hasCardAssetFailed(artwork)) return;
    let cancelled = false;
    void preloadCardAsset(artwork).then((ok) => {
      if (cancelled) return;
      setLoaded(ok);
      setFailed(!ok);
    });
    return () => {
      cancelled = true;
    };
  }, [artwork]);

  return (
    <>
      {!loaded && !failed && <div className="absolute inset-0 bg-card-face" aria-hidden="true" />}
      {failed && fallback}
      {!failed && (
        <img
          src={artwork}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-75",
            loaded ? "opacity-100" : "opacity-0",
          )}
          data-card-artwork-loaded={loaded ? "true" : "false"}
        />
      )}
    </>
  );
}

function CardFace({ card, artwork }: { card: Card; artwork: string | undefined }) {
  const semanticFallback = (
    <div className="absolute inset-0" data-card-semantic-fallback="true">
      {card.kind === "joker" ? (
        <div className="flex h-full flex-col items-center justify-center gap-0.5 font-display text-card-red">
          <span className="text-[calc(var(--card-w,4.5rem)*0.32)] leading-none">★</span>
          <span className="text-[calc(var(--card-w,4.5rem)*0.16)] font-semibold tracking-wider">JOKER</span>
        </div>
      ) : (
        <div className={cn("flex h-full flex-col p-[6%]", isRedSuit(card.suit) && "text-card-red")}>
          <span className="text-left font-display text-[calc(var(--card-w,4.5rem)*0.28)] font-semibold leading-none">
            {card.rank}
          </span>
          <span className="text-left text-[calc(var(--card-w,4.5rem)*0.22)] leading-none">
            {SUIT_SYMBOL[card.suit]}
          </span>
          <span className="mt-auto self-end text-[calc(var(--card-w,4.5rem)*0.42)] leading-none">
            {SUIT_SYMBOL[card.suit]}
          </span>
        </div>
      )}
    </div>
  );

  return artwork
    ? <CardArtwork artwork={artwork} alt={cardLabel(card)} fallback={semanticFallback} />
    : semanticFallback;
}
