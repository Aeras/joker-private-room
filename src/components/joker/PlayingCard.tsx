import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { assets } from "@/assets/registry";
import {
  hasCardAssetFailed,
  isCardAssetReady,
  preloadCardAsset,
  resolvedCardArtwork,
  CARD_RETRY_COOLDOWN_MS,
  recoverCardAsset,
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
          <CardArtwork key={back} artwork={back} alt="" fallback={<div className="card-back-pattern absolute inset-[3px] rounded-[0.35rem]" />} />
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
  const [retry, setRetry] = useState(0);
  const domLoaded = useRef(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    // A cached DOM surface can already be drawable while shared decode is pending.
    // Admit it before paint when flight ownership changes to the canonical card.
    const image = imageRef.current;
    domLoaded.current = !!image?.complete && image.naturalWidth > 0;
    if (domLoaded.current) {
      setLoaded(true);
      setFailed(false);
    }
  }, [artwork, retry]);

  useEffect(() => {
    if (domLoaded.current) return;
    setLoaded(!retry && isCardAssetReady(artwork));
    setFailed(!retry && hasCardAssetFailed(artwork));
    if (!retry && isCardAssetReady(artwork)) return;
    let cancelled = false;
    void (retry ? recoverCardAsset(artwork) : preloadCardAsset(artwork)).then((ok) => {
      if (cancelled || domLoaded.current) return;
      setLoaded(ok);
      setFailed(!ok);
    });
    return () => {
      cancelled = true;
    };
  }, [artwork, retry]);

  useEffect(() => {
    if (!failed || retry >= 2) return;
    const timer = window.setTimeout(() => setRetry(value => value + 1), CARD_RETRY_COOLDOWN_MS + 50);
    return () => window.clearTimeout(timer);
  }, [failed, retry]);
  useEffect(() => {
    if (!failed) return;
    // After bounded automatic attempts, a real network recovery may retry again.
    const online = () => setRetry(value => value + 1);
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [failed]);

  return (
    <>
      {!loaded && !failed && <div className="absolute inset-0 bg-card-face" aria-hidden="true" />}
      {failed && fallback}
      {(
        <img
          ref={imageRef}
          key={retry}
          src={resolvedCardArtwork(artwork)}
          alt={alt}
          decoding="async"
          onLoad={() => { domLoaded.current = true; setLoaded(true); setFailed(false); }}
          onError={() => { domLoaded.current = false; setFailed(true); }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-75",
            loaded && !failed ? "opacity-100" : "opacity-0",
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
    ? <CardArtwork key={artwork} artwork={artwork} alt={cardLabel(card)} fallback={semanticFallback} />
    : semanticFallback;
}
