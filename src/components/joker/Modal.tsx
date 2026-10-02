import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-label={title}>
      <button aria-label={t.close} className="absolute inset-0 bg-background/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "panel relative flex max-h-[92dvh] w-full flex-col rounded-b-none sm:rounded-b-[var(--radius-xl)] animate-bubble",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-display text-lg text-primary">{title}</h2>
          <button onClick={onClose} aria-label={t.close} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
