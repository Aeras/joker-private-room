import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const slugs = ["wave","laugh","point-laugh","cry","angry","wink","facepalm","thumbs-up","applause","surprised","flirty-wink","kiss","heart-eyes","shrug","celebrate","peekaboo","please","thinking","sleepy","cool"];

describe("20 custom premium Joker reactions", () => {
  it("picker uses all 20 semantic slugs and only optimized WebP assets", () => {
    const picker = read("src/components/table/EmojiPicker.tsx");
    const list = picker.split("export const EMOJI_SLUGS = ")[1]?.split(" as const;")[0];
    expect(JSON.parse(list ?? "[]")).toEqual(slugs);
    expect(picker).toContain("/emojis/joker/");
    expect(picker).toContain(".webp");
    expect(picker).not.toContain(".svg");
  });
  it("authoritative SQL validates exactly the new 20 reactions", () => {
    const migration = read("supabase/migrations/20261010180000_joker_20_reactions.sql");
    for (const slug of slugs) expect(migration).toContain("'" + slug + "'");
    expect(migration).toContain("create or replace function public.send_emoji_reaction_internal(");
    expect(migration).toContain("RATE_LIMITED");
  });
  it("CI converts exactly 20 source assets and preserves original PNGs outside public", () => {
    const workflow = read(".github/workflows/optimize-joker-reactions.yml");
    expect(workflow).toContain("len(targets) != 20");
    expect(workflow).toContain("artwork/joker-emojis/original");
    expect(workflow).toContain("quality=84");
  });
});
