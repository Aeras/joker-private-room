import { useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { FullscreenButton } from "@/components/joker/FullscreenButton";

/** The same room controls are available before and after the deal. */
export function BiribaRoomControls({
  children,
  isHost,
  busy,
  error,
  onEndGame,
}: {
  children?: ReactNode;
  isHost: boolean;
  busy: boolean;
  error?: string;
  onEndGame: () => Promise<boolean>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);

  async function confirm() {
    if (ending || busy) return;
    setEnding(true);
    try {
      if (await onEndGame()) setConfirmOpen(false);
    } finally {
      setEnding(false);
    }
  }

  return (
    <>
      <div className="biriba-room-controls">
        {children}
        <FullscreenButton className="!border-white/25 !bg-black/80 !text-white !shadow" />
        {isHost && (
          <div className="relative">
            <button
              type="button"
              aria-label="Μενού παιχνιδιού"
              aria-expanded={menuOpen}
              disabled={busy || ending}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-black/80 text-white shadow"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-2 min-w-44 rounded-lg border border-white/25 bg-[#111c1a] p-1 shadow-2xl">
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left text-sm text-red-200 hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                >
                  Τέλος παιχνιδιού
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {confirmOpen && isHost && (
        <div className="biriba-end-backdrop" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="biriba-end-title"
            className="biriba-end-dialog"
          >
            <h2 id="biriba-end-title" className="text-lg font-bold">
              Τέλος παιχνιδιού;
            </h2>
            <p className="mt-2 text-sm">
              Η παρτίδα θα τερματιστεί και όλοι οι παίκτες θα μπορούν να μπουν σε νέο παιχνίδι.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={ending}
                className="rounded-lg border border-white/30 px-4 py-2"
                onClick={() => setConfirmOpen(false)}
              >
                Άκυρο
              </button>
              <button
                type="button"
                disabled={ending || busy}
                className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
                onClick={() => void confirm()}
              >
                {ending ? "Τερματισμός…" : "Επιβεβαίωση"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
