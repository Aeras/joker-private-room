import { cn } from "@/lib/utils";

export function SpeechBubble({ text, toLabel, className }: { text: string; toLabel?: string; className?: string }) {
  return (
    <div className={cn("animate-bubble pointer-events-none z-20 max-w-[12rem] rounded-2xl bg-card-face px-3 py-2 text-sm text-card-ink shadow-card", className)}>
      {toLabel && <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-card-red">→ {toLabel}</div>}
      <div className="break-words">{text}</div>
    </div>
  );
}
