import type { EmojiReaction } from "@/services/dialogueFunctions";

/** Client-local visible lifetime from first receipt; backend expiry/rate limits are unaffected. */
export const EMOJI_VISIBLE_MS = 5000;

export interface DisplayedEmojiReaction extends EmojiReaction {
  key: string;
  visibleUntil: number;
}

export const emojiReactionKey = (r: EmojiReaction) => `${r.seat}|${r.emoji}|${r.expiresAt}`;

/** Merge observed reactions into the locally retained list (one per seat, newest wins). */
export function mergeEmojiReactions(
  previous: DisplayedEmojiReaction[],
  incoming: EmojiReaction[],
  now: number,
): DisplayedEmojiReaction[] {
  const bySeat = new Map<number, DisplayedEmojiReaction>();
  for (const r of previous) if (r.visibleUntil > now) bySeat.set(r.seat, r);
  const known = new Set(previous.map((r) => r.key));
  for (const r of incoming) {
    const key = emojiReactionKey(r);
    if (known.has(key)) continue;
    const current = bySeat.get(r.seat);
    if (current && Date.parse(current.createdAt) > Date.parse(r.createdAt)) continue;
    known.add(key);
    bySeat.set(r.seat, { ...r, key, visibleUntil: now + EMOJI_VISIBLE_MS });
  }
  const next = [...bySeat.values()];
  return next.length === previous.length && next.every((r, i) => r === previous[i]) ? previous : next;
}

export function pruneEmojiReactions(list: DisplayedEmojiReaction[], now: number) {
  const live = list.filter((r) => r.visibleUntil > now);
  return live.length === list.length ? list : live;
}
