import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { exportTimingDiagnosticsFile } from "@/lib/timingDiagnostics";
import { JButton } from "../joker/JButton";

export function TableUtilityMenu({
  isHost,
  disabled,
  onEndGame,
}: {
  isHost: boolean;
  disabled: boolean;
  onEndGame: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const finish = async () => {
    if (!isHost || ending || disabled) return;
    setEnding(true);
    const ok = await onEndGame().catch(() => false);
    if (ok) {
      // Ending a game never revokes the persistent player session.
      window.location.assign("/");
      return;
    }
    setEnding(false);
  };

  return (
    <>
      <div ref={rootRef} className="relative">
        <JButton
          variant="outlineGold"
          size="sm"
          className="h-8 w-8 bg-black/60 px-0"
          aria-label="Περισσότερες επιλογές"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </JButton>
        {open && (
          <div className="absolute right-0 top-10 z-[85] min-w-52 rounded-xl border border-white/10 bg-black/90 p-1.5 text-sm shadow-2xl backdrop-blur">
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-white/80 hover:bg-white/10"
              onClick={() => {
                exportTimingDiagnosticsFile();
                setOpen(false);
              }}
            >
              Λήψη timing diagnostic
            </button>
            {isHost ? (
              <button
                type="button"
                disabled={disabled}
                className="w-full rounded-lg px-3 py-2 text-left text-red-200 hover:bg-red-500/15 disabled:opacity-50"
                onClick={() => {
                  setOpen(false);
                  setConfirmOpen(true);
                }}
              >
                Τέλος παιχνιδιού
              </button>
            ) : null}
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/65 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#171010] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Τέλος παιχνιδιού;</h2>
            <p className="mt-2 text-sm text-white/70">Η παρτίδα θα τερματιστεί για όλους τους παίκτες.</p>
            <div className="mt-5 flex justify-end gap-2">
              <JButton variant="outlineGold" disabled={ending} onClick={() => setConfirmOpen(false)}>
                Ακύρωση
              </JButton>
              <JButton disabled={ending} className="bg-red-700 text-white hover:bg-red-600" onClick={() => void finish()}>
                {ending ? "Τερματισμός…" : "Τέλος παιχνιδιού"}
              </JButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
