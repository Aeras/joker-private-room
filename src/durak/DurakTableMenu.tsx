import { useEffect, useState } from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
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
  async function endGame() {
    if (!onEndGame || ending || !window.confirm(text.confirmEnd)) return;
    setEnding(true);
    try {
      await onEndGame();
    } catch {
      onError(text.endFailed);
    } finally {
      setEnding(false);
    }
  }
  return (
    <nav className="durak-fullscreen-navigation" aria-label={text.menu}>
      <button
        type="button"
        className="durak-fullscreen-navigation-button"
        aria-label={text.back}
        onClick={onBack}
      >
        <ArrowLeft size={20} />
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
              className="text-destructive"
              onSelect={() => void endGame()}
            >
              {text.endGame}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
