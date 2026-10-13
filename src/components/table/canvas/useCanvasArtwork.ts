import { useEffect, useRef, useState } from "react";
import { canvasCardAssets, canvasFlightAvailable } from "./assetCache";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
export function presentationWidth(css: string, fallback: number) {
  if (typeof document === "undefined") return fallback;
  const parent = document.querySelector(".joker-room") ?? document.body;
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:${css};height:0`;
  parent.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width > 0 ? width : fallback;
}
/** Prepare one bounded, public scene before selecting its renderer. Never switch mid-run. */
export function useCanvasArtwork(urls: readonly (string | undefined)[], scope: string | null) {
  const key = JSON.stringify([...new Set(urls.filter((url): url is string => Boolean(url)))]);
  const [result, setResult] = useState<{ scope: string | null; enabled: boolean } | null>(null);
  const decision = useRef<{ scope: string | null; enabled: boolean } | null>(null);
  useEffect(() => {
    if (!scope || !canvasFlightAvailable()) {
      decision.current = { scope, enabled: false };
      setResult(decision.current);
      return;
    }
    const releases: Array<() => void> = [];
    const pending = Promise.all((JSON.parse(key) as string[]).map((url) => {
      const image = canvasCardAssets.warm(url);
      releases.push(canvasCardAssets.retain?.(url) ?? (() => {}));
      return image;
    }));
    if (decision.current?.scope === scope) {
      setResult(decision.current);
      void pending;
      return () => { for (const release of releases) release(); };
    }
    let cancelled = false,
      decided = false;
    const finish = (enabled: boolean, reason?: "timeout" | "missing") => {
      if (cancelled || decided) return;
      decided = true;
      if (!enabled && reason) recordTimingDiagnostic("canvas_artwork_fallback", { reason });
      decision.current = { scope, enabled };
      setResult(decision.current);
    };
    const timer = window.setTimeout(() => finish(false, "timeout"), 120);
    void pending.then(
      (images) => {
        window.clearTimeout(timer);
        finish(images.every(Boolean), "missing");
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const release of releases) release();
    };
  }, [scope, key]);
  return result?.scope === scope ? result.enabled : null;
}
