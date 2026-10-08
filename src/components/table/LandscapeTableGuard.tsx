import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/i18n/el";
import { enterGameDisplayMode, maintainGameLandscape } from "@/lib/gameDisplayMode";

/** Keep the table mounted: rotating must not reset its presentation journal. */
export function LandscapeTableGuard({ children }: { children: ReactNode }) {
  const [portrait, setPortrait] = useState(() => window.matchMedia("(orientation: portrait)").matches);
  const requesting = useRef(false);
  const attemptedGesture = useRef(Boolean(document.fullscreenElement));
  useEffect(() => {
    const media = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(media.matches);
    const restoreLock = () => { if (document.visibilityState !== "hidden") void maintainGameLandscape(); };
    sync(); restoreLock();
    media.addEventListener("change", sync);
    document.addEventListener("fullscreenchange", restoreLock);
    document.addEventListener("visibilitychange", restoreLock);
    window.addEventListener("focus", restoreLock);
    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("fullscreenchange", restoreLock);
      document.removeEventListener("visibilitychange", restoreLock);
      window.removeEventListener("focus", restoreLock);
      try { screen.orientation?.unlock?.(); } catch { /* Best effort on unsupported browsers. */ }
    };
  }, []);
  const enter = async () => {
    if (requesting.current) return;
    requesting.current = true;
    attemptedGesture.current = true;
    try { await enterGameDisplayMode(document.getElementById("table-fullscreen-root") ?? undefined); }
    finally { requesting.current = false; }
  };
  const firstTouchGesture = () => {
    if (attemptedGesture.current || document.fullscreenElement || !window.matchMedia("(pointer: coarse)").matches) return;
    attemptedGesture.current = true;
    void enter();
  };
  return <>
    <div className="table-landscape-content absolute inset-0" inert={portrait} aria-hidden={portrait || undefined} onClickCapture={firstTouchGesture}>{children}</div>
    <div className="table-landscape-guard" role="status" aria-live="polite">
      <div className="max-w-sm text-center text-white">
        <div className="mb-4 text-5xl" aria-hidden="true">↻</div>
        <h2 className="text-xl font-semibold text-primary">{t.landscapeRequired}</h2>
        <p className="mt-3 text-sm text-white/70">{t.landscapeRequiredHelp}</p>
        <button type="button" onClick={() => void enter()} className="mt-6 min-h-12 rounded-xl border border-primary/50 px-5 py-3 font-semibold text-primary">{t.landscapeFullscreen}</button>
      </div>
    </div>
  </>;
}
