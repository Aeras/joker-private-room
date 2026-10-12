export const REALTIME_EVENT = "joker_state_changed";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface Invalidation {
  protocol: 1;
  gameId: string;
  stateVersion: number;
  kind: "state_changed" | "game_closed";
  emittedAt: string;
}
export interface RealtimeCapability {
  gameId: string;
  token: string;
  topic: string;
  expiresAt: number;
}
export type CapabilityResult =
  | { ok: true; capability: RealtimeCapability }
  | { ok: false; code: "DISABLED" | "NOT_AUTHENTICATED" | "NOT_MEMBER" | "UNAVAILABLE" };
/** Strict allowlist. Notifications carry no cards and never enter snapshot admission. */
export function parseInvalidation(value: unknown, gameId: string): Invalidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(",") !== "emittedAt,gameId,kind,protocol,stateVersion" ||
    v["protocol"] !== 1 ||
    v["gameId"] !== gameId ||
    !UUID.test(gameId) ||
    !Number.isSafeInteger(v["stateVersion"]) ||
    Number(v["stateVersion"]) < 0 ||
    !["state_changed", "game_closed"].includes(String(v["kind"])) ||
    typeof v["emittedAt"] !== "string" ||
    !Number.isFinite(Date.parse(v["emittedAt"]))
  )
    return null;
  return {
    protocol: 1,
    gameId,
    stateVersion: Number(v["stateVersion"]),
    kind: v["kind"] as Invalidation["kind"],
    emittedAt: v["emittedAt"],
  };
}
export function validCapability(c: RealtimeCapability, gameId: string, now: number): boolean {
  const topic = c.topic?.split(":");
  return (
    c.gameId === gameId &&
    UUID.test(gameId) &&
    topic?.length === 4 &&
    topic[0] === "joker" &&
    topic[1] === "v1" &&
    topic[2] === gameId &&
    UUID.test(topic[3] ?? "") &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(c.token) &&
    c.expiresAt > now + 5_000 &&
    c.expiresAt <= now + 120_000
  );
}
