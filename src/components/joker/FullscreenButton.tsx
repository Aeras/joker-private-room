import { Maximize2, Minimize2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { enterGameDisplayMode } from "@/lib/gameDisplayMode";
import { cn } from "@/lib/utils";

export function FullscreenButton({ className }: { className?: string }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [landscape, setLandscape] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > window.innerHeight : true,
  );

  useEffect(() => {
    const sync = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      setLandscape(window.innerWidth > window.innerHeight);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  const toggle = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Best effort only.
      }
      return;
    }
    await enterGameDisplayMode();
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={cn(
        "pregame-fullscreen-button inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition active:scale-95",
        className,
      )}
      aria-label={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}
      title={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}
    >
      {fullscreen ? <Minimize2 className="h-4 w-4" /> : landscape ? <Maximize2 className="h-4 w-4" /> : <RotateCw className="h-4 w-4" />}
      <span className="hidden sm:inline">{fullscreen ? "Έξοδος" : "Full screen"}</span>
    </button>
  );
}
