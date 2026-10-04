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

/** Best-effort, event-deduplicated presentation audio. Gameplay never awaits this. */
export function playGameSound(kind: GameSound, eventId: string): void {
  if (!eventId || !remember(`${kind}:${eventId}`)) return;
  if (!getSoundEnabled()) return;
  try {
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

export function resetGameAudioForTests(): void {
  seen.clear();
  seenOrder.length = 0;
  pools.clear();
  cursor.clear();
}
