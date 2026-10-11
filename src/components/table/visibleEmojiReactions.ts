import type { EmojiReaction } from '@/services/dialogueFunctions';

export type VisibleEmojiReaction = EmojiReaction & { visibleUntil: number };

export function mergeVisibleEmojis(previous: VisibleEmojiReaction[], incoming: EmojiReaction[], now: number): VisibleEmojiReaction[] {
  const active = previous.filter(reaction => reaction.visibleUntil > now);
  for (const reaction of incoming) {
    if (Date.parse(reaction.expiresAt) <= now) continue;
    const existing = active.find(item => item.seat === reaction.seat && item.emoji === reaction.emoji && item.expiresAt === reaction.expiresAt);
    if (existing) continue;
    const next = { ...reaction, visibleUntil: now + 5000 };
    const index = active.findIndex(item => item.seat === reaction.seat);
    if (index >= 0) active[index] = next;
    else active.push(next);
  }
  return active;
}
