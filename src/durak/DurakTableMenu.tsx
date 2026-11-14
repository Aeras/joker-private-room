import { useEffect, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { durakTableText as text } from "@/i18n/durak.el";

export function DurakTableMenu({
  onBack,
  onRefresh,
  onEndGame,
  onError,
}: {
  onBack: () => void;
  onRefresh: () => void;
  onEndGame?: (() => Promise<void>) | undefined;
  onError: (message: string) => void;
}) {
  const [fullscreen, setFullscreen] = useState(
    typeof document !== "undefined" && Boolean(document.fullscreenElement),
  );
  const [ending, setEnding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [modalError, setModalError] = useState("");
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      onError(text.fullscreenFailed);
    }
  }
  async function handleConfirmEnd() {
    if (!onEndGame || ending) return;
    setEnding(true);
    setModalError("");
    try {
      await onEndGame();
      setConfirmOpen(false);
    } catch {
      setModalError(text.endFailed);
      onError(text.endFailed);
    } finally {
      setEnding(false);
    }
  }
  return (
    <>
      <nav className="durak-fullscreen-navigation" aria-label={text.menu}>
        <button
          type="button"
          className="durak-fullscreen-navigation-button"
          aria-label={text.back}
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="durak-fullscreen-navigation-tools">
          <button
            type="button"
            className="durak-fullscreen-navigation-button"
            aria-label={fullscreen ? text.exitFullscreen : text.fullscreen}
            title={fullscreen ? text.exitFullscreen : text.fullscreen}
            disabled={typeof document === "undefined" || !document.documentElement.requestFullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="durak-fullscreen-navigation-button"
                aria-label={text.menu}
                disabled={ending}
              >
                <MoreVertical size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="z-[110] min-w-44">
              <DropdownMenuItem onSelect={onRefresh}>{text.refresh}</DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  typeof document === "undefined" || !document.documentElement.requestFullscreen
                }
                onSelect={() => void toggleFullscreen()}
              >
                {fullscreen ? text.exitFullscreen : text.fullscreen}
              </DropdownMenuItem>
              {onEndGame && (
                <DropdownMenuItem
                  disabled={ending}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  onSelect={() => {
                    setModalError("");
                    setConfirmOpen(true);
                  }}
                >
                  {text.endGame}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !ending) {
              setConfirmOpen(false);
              setModalError("");
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="durak-confirm-title"
            className="w-full max-w-sm rounded-2xl border border-primary/35 bg-[#0e1713]/95 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] text-white backdrop-blur-md"
          >
            <h2 id="durak-confirm-title" className="text-base font-semibold text-amber-200/95 font-serif tracking-wide">
              Τερματισμός παιχνιδιού;
            </h2>
            <p className="mt-2 text-sm text-white/80 leading-relaxed">
              Πρόκειται να τερματίσετε το παιχνίδι DURAK για όλους τους παίκτες.
            </p>
            {modalError && (
              <p role="alert" className="mt-3 text-xs text-red-300 bg-red-950/60 border border-red-800/50 rounded-lg p-2.5">
                {modalError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={ending}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10 hover:border-white/30 transition-colors disabled:opacity-50 touch-manipulation"
                onClick={() => {
                  setConfirmOpen(false);
                  setModalError("");
                }}
              >
                Ακύρωση
              </button>
              <button
                type="button"
                disabled={ending}
                className="rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 shadow-md touch-manipulation"
                onClick={() => void handleConfirmEnd()}
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
