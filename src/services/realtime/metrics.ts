import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
/** Coarse local diagnostics only; no token, topic, cookie, URL or projection payload. */
export function observeRealtimePerformance(): () => void {
  let observer: PerformanceObserver | null = null;
  try {
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          recordTimingDiagnostic("realtime_long_task", { durationMs: entry.duration });
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
  } catch {
    /* Unsupported browser; measurements are optional. */
  }
  const sample = () => {
    const canvases = Array.from(
      document.querySelectorAll<HTMLCanvasElement>("canvas[data-renderer]"),
    );
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    recordTimingDiagnostic("realtime_client_resources", {
      canvasCount: canvases.length,
      estimatedBackingBytes: canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0),
      usedJsHeapBytes: memory?.usedJSHeapSize ?? null,
    });
  };
  sample();
  const timer = window.setInterval(sample, 5_000);
  return () => {
    window.clearInterval(timer);
    observer?.disconnect();
  };
}
