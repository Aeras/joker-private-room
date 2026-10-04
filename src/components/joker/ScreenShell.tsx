import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export function ScreenShell({
  title,
  children,
  footer,
  variant = "default",
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "pregame";
}) {
  const pregame = variant === "pregame";

  return (
    <div className={cn("surface-room flex min-h-dvh flex-col", pregame && "pregame-shell")}>
      <header className="relative z-10 mx-auto flex w-full max-w-xl items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link
          to="/"
          aria-label={t.back}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-accent hover:text-foreground active:scale-95",
            pregame && "border border-primary/20 bg-black/20 backdrop-blur-sm hover:border-primary/45 hover:bg-black/35",
          )}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className={cn("font-display text-xl text-foreground", pregame && "tracking-[0.08em] text-primary")}>{title}</h1>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-xl flex-1 px-4 py-5">{children}</main>
      {footer && (
        <div className={cn(
          "sticky bottom-0 z-10 mx-auto w-full max-w-xl bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6",
          pregame && "from-[#13070a] via-[#13070a]/95",
        )}>
          {footer}
        </div>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary/90">{children}</h2>
  );
}
