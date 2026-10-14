import type { BiribaSuit } from "./rules";

const suitSymbols: Record<BiribaSuit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};
const suitNames: Record<BiribaSuit, string> = {
  spades: "μπαστούνια",
  hearts: "κούπες",
  diamonds: "καρό",
  clubs: "σπαθιά",
};

export function BiribaTrumpIndicator({ suit }: { suit: BiribaSuit | null | undefined }) {
  return (
    <div
      className="biriba-trump-frame"
      role="img"
      aria-label={`Ατού: ${suit ? suitNames[suit] : "δεν ορίστηκε"}`}
    >
      <span className="biriba-trump-label">ΑΤΟΥ</span>
      <span className="biriba-trump-symbol" data-suit={suit ?? "none"} aria-hidden="true">
        {suit ? suitSymbols[suit] : "—"}
      </span>
    </div>
  );
}
