import { getSoundEnabled } from "./soundPreference";
export type GameSound = "shuffle" | "deal" | "play";

const SOUND_PATH: Record<GameSound, string> = {
  shuffle: "/sounds/card_shuffle.mp3",
  deal: "/sounds/card_deal.mp3",
  play: "/sounds/card_play.mp3",
};

const POOL_SIZE = 4;
const MAX_SEEN_EVENTS = 256;
const pools = new Map<GameSound, HTMLAudioElement[]>();
const cursor = new Map<GameSound, number>();
const seen = new Set<string>();
const seenOrder: string[] = [];
const decoded = new Map<GameSound, AudioBuffer>();
const pending = new Map<GameSound, Promise<void>>();
const active = new Map<GameSound, AudioBufferSourceNode>();
let context: AudioContext | null = null;

function remember(eventId: string): boolean {
  if (seen.has(eventId)) return false;
  seen.add(eventId);
  seenOrder.push(eventId);
  while (seenOrder.length > MAX_SEEN_EVENTS) {
    const oldest = seenOrder.shift();
    if (oldest) seen.delete(oldest);
  }
  return true;
}

function audioContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined" || !window.AudioContext) return null;
  try { context = new window.AudioContext(); } catch { return null; }
  return context;
}

/** Decode in advance; never replay an old event when decoding finishes. */
export function prepareGameAudio(): void {
  const ctx = audioContext();
  if (!ctx) return;
  for (const kind of ["shuffle", "deal", "play"] as const) {
    if (decoded.has(kind) || pending.has(kind)) continue;
    const load = fetch(SOUND_PATH[kind])
      .then(response => { if (!response.ok) throw new Error("AUDIO_FETCH"); return response.arrayBuffer(); })
      .then(buffer => ctx.decodeAudioData(buffer))
      .then(buffer => { if (context === ctx) decoded.set(kind, buffer); })
      .catch(() => undefined)
      .finally(() => { if (pending.get(kind) === load) pending.delete(kind); });
    pending.set(kind, load);
  }
}

function poolFor(kind: GameSound): HTMLAudioElement[] {
  const existing = pools.get(kind);
  if (existing) return existing;
  if (typeof Audio === "undefined") return [];
  const created = Array.from({ length: POOL_SIZE }, () => {
    const audio = new Audio(SOUND_PATH[kind]);
    audio.preload = "auto";
    return audio;
  });
  pools.set(kind, created);
  return created;
}

/** Do not let a long/late deal sound tail follow the subsequent card. */
function stopPreviousDeal(): void {
  const previous = active.get("deal");
  if (previous) {
    try { previous.stop(); } catch { /* already stopped */ }
    active.delete("deal");
  }
  for (const audio of pools.get("deal") ?? []) {
    audio.pause();
    try { audio.currentTime = 0; } catch { /* resource not seekable yet */ }
  }
}

/** Best-effort, event-deduplicated presentation audio. Gameplay never awaits audio. */
export function playGameSound(kind: GameSound, eventId: string): void {
  if (!eventId || !remember(`${kind}:${eventId}`)) return;
  if (!getSoundEnabled()) return;
  try {
    if (kind === "deal") stopPreviousDeal();
    const ctx = audioContext();
    const buffer = decoded.get(kind);
    if (ctx && buffer) {
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      if (kind === "deal") {
        active.set(kind, source);
        source.onended = () => { if (active.get(kind) === source) active.delete(kind); };
      }
      source.start(ctx.currentTime);
      return;
    }
    // The first event uses the existing HTMLAudio path during cold decoding.
    // It is intentionally NOT replayed on readiness (avoids delayed extra sounds).
    prepareGameAudio();
    const pool = poolFor(kind);
    if (pool.length === 0) return;
    const index = cursor.get(kind) ?? 0;
    cursor.set(kind, (index + 1) % pool.length);
    const audio = pool[index]!;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // Browser autoplay/background/missing-file failures are intentionally silent.
  }
}

export function stopGameDealAudio(): void {
  stopPreviousDeal();
}

export function resetGameAudioForTests(): void {
  stopPreviousDeal();
  seen.clear();
  seenOrder.length = 0;
  pools.clear();
  cursor.clear();
  decoded.clear();
  pending.clear();
  const previous = context;
  context = null;
  if (previous) void previous.close().catch(() => undefined);
}
