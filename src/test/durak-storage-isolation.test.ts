import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261011011000_durak_isolated_rooms.sql"), "utf8");
describe("DURAK storage isolation", () => {
  it("creates only DURAK tables and does not alter JOKER tables", () => {
    expect(sql).toContain("create table if not exists public.durak_rooms");
    expect(sql).toContain("create table if not exists public.durak_room_seats");
    expect(sql).not.toMatch(/alter table public\.(rooms|room_seats|games|game_state)\b/i);
  });
  it("enforces restricted data access", () => {
    expect(sql).toContain("alter table public.durak_rooms enable row level security");
    expect(sql).toContain("alter table public.durak_room_seats enable row level security");
    expect(sql).toContain("revoke all on public.durak_rooms from public, anon, authenticated");
    expect(sql).toContain("revoke all on public.durak_room_seats from public, anon, authenticated");
  });
  it("enforces variant, size, identity and seat constraints", () => {
    expect(sql).toContain("variant in ('podkidnoy','perevodnoy')");
    expect(sql).toContain("capacity between 2 and 6");
    expect(sql).toContain("durak_seat_occupant_consistency");
    expect(sql).toContain("durak_seat_capacity_check");
    expect(sql).toContain("durak_one_human_per_room");
  });
});
