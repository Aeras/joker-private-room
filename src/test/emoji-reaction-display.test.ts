import { describe, expect, it } from "vitest";
import { EMOJI_VISIBLE_MS, mergeEmojiReactions, pruneEmojiReactions } from "@/lib/emojiReactionDisplay";

const r = (seat: number, emoji: string, createdMs: number) => ({
  seat, emoji,
  createdAt: new Date(createdMs).toISOString(),
  expiresAt: new Date(createdMs + 2000).toISOString(),
});

describe("emoji reaction local display lifetime", () => {
  it("shows for 5000ms from first receipt regardless of server expiresAt", () => {
    const list = mergeEmojiReactions([], [r(1, "wave", 0)], 1000);
    expect(list[0]!.visibleUntil).toBe(1000 + EMOJI_VISIBLE_MS);
  });
  it("repeated polling does not reset visibleUntil", () => {
    const a = mergeEmojiReactions([], [r(1, "wave", 0)], 1000);
    const b = mergeEmojiReactions(a, [r(1, "wave", 0)], 3000);
    expect(b).toBe(a);
    expect(b[0]!.visibleUntil).toBe(6000);
  });
  it("keeps reactions after backend stops returning them", () => {
    const a = mergeEmojiReactions([], [r(1, "wave", 0)], 1000);
    const b = mergeEmojiReactions(a, [], 5900);
    expect(b).toHaveLength(1);
  });
  it("newer reaction replaces older for the same seat; older is ignored", () => {
    const a = mergeEmojiReactions([], [r(1, "wave", 0)], 1000);
    const b = mergeEmojiReactions(a, [r(1, "cry", 500)], 1500);
    expect(b.map((x) => x.emoji)).toEqual(["cry"]);
    expect(b[0]!.visibleUntil).toBe(6500);
    const c = mergeEmojiReactions(b, [r(1, "wave", 0)], 1600);
    expect(c.map((x) => x.emoji)).toEqual(["cry"]);
    const d = mergeEmojiReactions(c, [r(2, "laugh", 100)], 1700);
    expect(d).toHaveLength(2);
  });
  it("prunes after local deadline", () => {
    const a = mergeEmojiReactions([], [r(1, "wave", 0)], 1000);
    expect(pruneEmojiReactions(a, 5999)).toBe(a);
    expect(pruneEmojiReactions(a, 6000)).toEqual([]);
  });
});
