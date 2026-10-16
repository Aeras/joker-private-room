/**
 * Browser-only, opt-in-by-deployment Biriba telemetry. Keeps the hot animation
 * path synchronous and allocation-light; network work happens in batches.
 * No hidden cards, PINs, cookies, tokens, or input contents are recorded.
 */
import { biribaDiagnostics } from "@/services/biribaDiagnostics";

export type DiagnosticKind =
  | "device" | "revision" | "action_start" | "action_end" | "animation_start"
  | "animation_end" | "animation_timeout" | "warning" | "error"
  | "long_task" | "frame_gap" | "visibility" | "match_finished";
export type DiagnosticEntry = { kind: DiagnosticKind; t: number; data: Record<string, string | number | boolean | null> };

const BATCH_SIZE = 30;
const MAX_QUEUED = 250;
const SLOW_FRAME_MS = 180;
const FLUSH_INTERVAL_MS = 8000;

export function describeDevice() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android"
    : /Windows/i.test(ua) ? "Windows" : /Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  return {
    os, browser, width: window.innerWidth, height: window.innerHeight,
    dpr: window.devicePixelRatio, memory: "deviceMemory" in navigator ? String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "") : "",
    touch: navigator.maxTouchPoints > 0, standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
  };
}

export class BiribaFlightRecorder {
  private readonly key: string;
  private queue: DiagnosticEntry[] = [];
  private active = true;
  private inflight = false;
  private interval: ReturnType<typeof setInterval> | undefined;
  private cleanup: Array<() => void> = [];
  constructor(private readonly code: string) {
    this.key = crypto.randomUUID();
    this.record("device", describeDevice());
    this.interval = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    if (typeof window === "undefined") return;
    const visibility = () => {
      this.record("visibility", { state: document.visibilityState });
      if (document.visibilityState === "hidden") void this.flush();
    };
    const error = (event: ErrorEvent) => this.record("error", { name: "browser_error", message: String(event.message).slice(0, 160) });
    const rejection = () => this.record("error", { name: "unhandled_rejection" });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", rejection);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", visibility),
      () => window.removeEventListener("error", error),
      () => window.removeEventListener("unhandledrejection", rejection));
    try {
      const observer = new PerformanceObserver(list => {
        for (const item of list.getEntries()) this.record("long_task", { durationMs: Math.round(item.duration) });
      });
      observer.observe({ entryTypes: ["longtask"] });
      this.cleanup.push(() => observer.disconnect());
    } catch { /* PerformanceObserver unsupported; recorder still works. */ }
    let last = performance.now();
    let frame = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (!this.active) return;
      if (document.visibilityState === "visible" && ++frame % 2 === 0) {
        const gap = now - last;
        if (gap > SLOW_FRAME_MS) this.record("frame_gap", { gapMs: Math.round(gap) });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.cleanup.push(() => cancelAnimationFrame(raf));
  }

  record(kind: DiagnosticKind, data: Record<string, string | number | boolean | null> = {}) {
    if (!this.active) return;
    const safe: DiagnosticEntry["data"] = {};
    // Whitelist primitive, small diagnostic values: never serialize game state.
    for (const [key, value] of Object.entries(data)) {
      if (!/^[A-Za-z][A-Za-z0-9]{0,35}$/.test(key)) continue;
      if (typeof value === "string") safe[key] = value.slice(0, 160);
      else if (typeof value === "number" && Number.isFinite(value)) safe[key] = Math.round(value * 100) / 100;
      else if (typeof value === "boolean" || value === null) safe[key] = value;
    }
    if (this.queue.length >= MAX_QUEUED) this.queue.shift();
    this.queue.push({ kind, t: Date.now(), data: safe });
    if (this.queue.length >= BATCH_SIZE) void this.flush();
  }

  async flush() {
    if (this.inflight || !this.queue.length) return;
    this.inflight = true;
    const events = this.queue.splice(0, BATCH_SIZE);
    try {
      const result = await biribaDiagnostics({ data: { action: "ingest", code: this.code,
        payload: { sessionKey: this.key, events } } });
      if (!result.ok || result.limit) this.queue = [];
    } catch { /* Diagnostics are best effort and NEVER block gameplay. */ }
    finally {
      this.inflight = false;
      if (this.active && this.queue.length >= BATCH_SIZE) void this.flush();
    }
  }

  stop() {
    if (!this.active) return;
    this.record("visibility", { state: "closed" });
    // Best effort only; do not hold up route navigation.
    void this.flush();
    this.active = false;
    if (this.interval) clearInterval(this.interval);
    for (const teardown of this.cleanup) teardown();
    this.cleanup = [];
  }
}
