import { RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";

export function RefreshButton({ className }: { className?: string }) {
  const navigating = useRef(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    if (navigating.current) return;
    const url = new URL(window.location.href);
    // A distinct document request loads the latest HTML and its versioned bundles.
    // replace avoids accumulating refresh entries in Back history; session data stays intact.
    url.searchParams.set("_refresh", crypto.randomUUID());
    navigating.current = true;
    setBusy(true);
    window.location.replace(url.href);
  };
  return <button type="button" disabled={busy} aria-label={t.refreshApp} title={t.refreshAppHelp}
    onClick={refresh} className={cn("pregame-fullscreen-button inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition active:scale-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
    <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden="true" />
    <span>{t.refreshApp}</span>
  </button>;
}
