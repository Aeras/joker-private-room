import { Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { FullscreenButton } from "@/components/joker/FullscreenButton";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export function ScreenShell({
  title,
  children,
  footer,
  variant = "default",
  contentClassName,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "pregame";
  contentClassName?: string;
}) {
  const pregame = variant === "pregame";

  return (
    <div className={cn("surface-room flex min-h-dvh flex-col", pregame && "pregame-shell")}>
      <header className={cn(
        "relative z-20 mx-auto flex w-full items-center gap-3 px-4 pt-[max(.65rem,env(safe-area-inset-top))]",
        pregame ? "max-w-7xl" : "max-w-xl",
      )}>
        <Link
          to="/"
          aria-label={t.back}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95",
            pregame && "border border-primary/20 bg-black/20 backdrop-blur-sm hover:border-primary/45 hover:bg-black/35",
          )}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className={cn(
          "min-w-0 flex-1 truncate font-display text-xl text-foreground",
          pregame && "tracking-[0.08em] text-primary",
        )}>{title}</h1>
        {pregame && <FullscreenButton />}
      </header>

      <main className={cn(
        "relative z-10 mx-auto w-full flex-1 px-4",
        pregame ? "max-w-7xl overflow-hidden py-3" : "max-w-xl py-5",
        contentClassName,
      )}>{children}</main>

      {footer && (
        <div className={cn(
          "relative z-10 mx-auto w-full px-4 pb-[max(.7rem,env(safe-area-inset-bottom))] pt-2",
          pregame ? "max-w-7xl" : "max-w-xl",
        )}>
          {footer}
        </div>
      )}

      {pregame && (
        <div className="pregame-portrait-gate" role="status" aria-live="polite">
          <RotateCw className="h-10 w-10" />
          <strong>Γύρισε τη συσκευή οριζόντια</strong>
          <span>Το JOKER είναι σχεδιασμένο για landscape προβολή.</span>
          <FullscreenButton className="mt-2" />
        </div>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary/90">{children}</h2>
  );
}
