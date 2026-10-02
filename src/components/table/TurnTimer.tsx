import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export function TurnTimer({ seconds }: { seconds: number }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 font-display tabular-nums",
        seconds <= 10 ? "text-negative" : "text-primary",
      )}
      aria-live="polite"
    >
      <Timer className="h-4 w-4" />
      {mm}:{ss}
    </div>
  );
}
