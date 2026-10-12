import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  parseInvalidation,
  validCapability,
  type RealtimeCapability,
} from "@/services/realtime/protocol";
import { RealtimeLifecycle } from "@/services/realtime/lifecycle";
import {
  issueRealtimeCapability,
  signRealtimeJwt,
} from "../../supabase/functions/_shared/joker-realtime-capability";
const game = "00000000-0000-4000-8000-000000000201",
  session = "00000000-0000-4000-8000-000000000301",
  player = "00000000-0000-4000-8000-000000000401";
const now = 1_790_000_000_000;
const capability = (): RealtimeCapability => ({
  gameId: game,
  token: "header.payload.signature",
  topic: `joker:v1:${game}:${session}`,
  expiresAt: now + 90_000,
});
const event = (version: number) => ({
  protocol: 1,
  gameId: game,
  stateVersion: version,
  kind: "state_changed",
  emittedAt: new Date(now).toISOString(),
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("strict sanitized invalidation", () => {
  it("accepts only the exact public allowlist", () => {
    expect(parseInvalidation(event(3), game)?.stateVersion).toBe(3);
    for (const field of ["hands", "deck", "seed", "pin", "sessionToken", "projection"])
      expect(parseInvalidation({ ...event(3), [field]: "secret" }, game)).toBeNull();
    for (const v of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(parseInvalidation(event(v), game)).toBeNull();
    expect(parseInvalidation(event(3), session)).toBeNull();
    expect(parseInvalidation({ ...event(3), protocol: 2 }, game)).toBeNull();
  });
  it("binds a bounded capability to one game/session topic", () => {
    expect(validCapability(capability(), game, now)).toBe(true);
    for (const change of [
      { topic: `joker:v1:${session}:${session}` },
      { expiresAt: now },
      { expiresAt: now + 121_000 },
      { token: "publishable-key" },
    ])
      expect(validCapability({ ...capability(), ...change }, game, now)).toBe(false);
  });
});
function broker() {
  return {
    enabled: true,
    now: () => now,
    authorize: vi.fn(async () => ({
      playerId: player,
      sessionId: session,
      expiresAt: new Date(now + 999_999).toISOString(),
    })),
    sign: vi.fn(async () => "signed.jwt.token"),
  };
}
describe("custom-session capability broker core (authorization RPC simulated)", () => {
  it("does no privileged work when disabled or session/game input is invalid", async () => {
    const d = broker();
    expect(await issueRealtimeCapability("a".repeat(64), game, { ...d, enabled: false })).toEqual({
      ok: false,
      code: "DISABLED",
    });
    expect((await issueRealtimeCapability("cookie", game, d)).ok).toBe(false);
    expect((await issueRealtimeCapability("a".repeat(64), "bad", d)).ok).toBe(false);
    expect(d.authorize).not.toHaveBeenCalled();
    expect(d.sign).not.toHaveBeenCalled();
  });
  it("fails closed on rejected membership/revocation and RPC failures", async () => {
    const d = broker();
    expect(
      await issueRealtimeCapability("a".repeat(64), game, { ...d, authorize: async () => null }),
    ).toEqual({ ok: false, code: "NOT_MEMBER" });
    expect(
      await issueRealtimeCapability("a".repeat(64), game, {
        ...d,
        authorize: async () => {
          throw Error("db");
        },
      }),
    ).toEqual({ ok: false, code: "UNAVAILABLE" });
    expect(d.sign).not.toHaveBeenCalled();
  });
  it("selects receive claims server-side and caps lifetime by custom-session expiry", async () => {
    const d = broker(),
      result = await issueRealtimeCapability("b".repeat(64), game, d);
    expect(result).toMatchObject({
      ok: true,
      capability: { expiresAt: now + 90_000, topic: `joker:v1:${game}:${session}` },
    });
    expect(d.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: player,
        role: "authenticated",
        jkr_scope: "receive",
        jkr_game_id: game,
        jkr_session_id: session,
      }),
    );
    expect(JSON.stringify(d.sign.mock.calls)).not.toContain("b".repeat(64));
    d.authorize.mockResolvedValue({
      playerId: player,
      sessionId: session,
      expiresAt: new Date(now + 20_000).toISOString(),
    });
    expect(await issueRealtimeCapability("a".repeat(64), game, d)).toMatchObject({
      ok: true,
      capability: { expiresAt: now + 20_000 },
    });
    d.authorize.mockResolvedValue({
      playerId: player,
      sessionId: session,
      expiresAt: new Date(now + 1_000).toISOString(),
    });
    expect((await issueRealtimeCapability("a".repeat(64), game, d)).ok).toBe(false);
  });
  it("produces a verifiable ES256 JWT using only an ephemeral test key", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const jwk = await webcrypto.subtle.exportKey("jwk", keys.privateKey);
    const jwt = await signRealtimeJwt(
      { sub: player, exp: Math.floor(now / 1000) + 90 },
      jwk,
      "test-kid",
      "test-issuer",
    );
    const parts = jwt.split(".");
    expect(
      await webcrypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        keys.publicKey,
        Buffer.from(parts[2]!, "base64url"),
        Buffer.from(parts[0] + "." + parts[1]),
      ),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(parts[0]!, "base64url").toString())).toMatchObject({
      alg: "ES256",
      kid: "test-kid",
    });
    expect(
      JSON.stringify(JSON.parse(Buffer.from(parts[1]!, "base64url").toString())),
    ).not.toContain(jwk.d!);
    await expect(signRealtimeJwt({}, { kty: "oct" }, "bad", "test")).rejects.toThrow();
  });
});
function lifecycleSetup() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  let message: (p: unknown) => void = () => {},
    status: (s: string) => void = () => {};
  const close = vi.fn(),
    refresh = vi.fn(async () => 3),
    metric = vi.fn(),
    brokerCall = vi.fn(async () => ({
      ok: true as const,
      capability: { ...capability(), expiresAt: Date.now() + 90_000 },
    }));
  const connect = vi.fn(async (_c: RealtimeCapability, m: typeof message, s: typeof status) => {
    message = m;
    status = s;
    return { close };
  });
  const controller = new RealtimeLifecycle(game, {
    capability: brokerCall,
    connect,
    refresh,
    metric,
    version: () => 0,
    now: Date.now,
  });
  return {
    controller,
    refresh,
    metric,
    close,
    brokerCall,
    connect,
    message: (p: unknown) => message(p),
    status: (s: string) => status(s),
  };
}
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
describe("receive lifecycle with simulated socket", () => {
  it("refreshes on subscribe, deduplicates older/repeated notifications", async () => {
    const d = lifecycleSetup();
    d.controller.start();
    await flush();
    d.status("SUBSCRIBED");
    await flush();
    d.refresh.mockResolvedValue(4);
    d.message(event(4));
    await flush();
    d.message(event(4));
    d.message(event(2));
    d.message({ ...event(9), hands: [] });
    await flush();
    expect(d.refresh).toHaveBeenCalledTimes(2);
    d.controller.stop();
    expect(d.close).toHaveBeenCalledOnce();
  });
  it("coalesces bursts during a fetch and bounds far-future refresh retries", async () => {
    const d = lifecycleSetup();
    let resolve!: (v: number) => void;
    d.refresh.mockImplementationOnce(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    d.controller.start();
    await flush();
    d.message(event(1));
    d.message(event(2));
    d.message(event(3));
    expect(d.refresh).toHaveBeenCalledOnce();
    resolve(1);
    await flush();
    expect(d.refresh).toHaveBeenCalledTimes(2);
    d.message(event(999999));
    await flush();
    expect(d.refresh).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.refresh).toHaveBeenCalledTimes(4);
    d.refresh.mockResolvedValue(4);
    d.message(event(4));
    await flush();
    expect(d.refresh).toHaveBeenCalledTimes(5);
    d.controller.stop();
  });
  it("renews by closing the old token/socket; revocation failure stops it", async () => {
    const d = lifecycleSetup();
    d.controller.start();
    await flush();
    d.brokerCall.mockImplementation(async () => ({ ok: false, code: "NOT_MEMBER" }) as never);
    await vi.advanceTimersByTimeAsync(75_000);
    expect(d.close).toHaveBeenCalledOnce();
    expect(d.brokerCall).toHaveBeenCalledTimes(2);
    d.message(event(5));
    await flush();
    expect(d.refresh).not.toHaveBeenCalled();
  });
  it("retries socket failures, hydrates after reconnect, ignores callbacks after route cleanup", async () => {
    const d = lifecycleSetup();
    d.controller.start();
    await flush();
    const oldMessage = d.message;
    d.status("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(2000);
    expect(d.connect).toHaveBeenCalledTimes(2);
    d.status("SUBSCRIBED");
    await flush();
    expect(d.refresh).toHaveBeenCalledOnce();
    d.controller.stop();
    oldMessage(event(8));
    d.status("SUBSCRIBED");
    await flush();
    expect(d.refresh).toHaveBeenCalledOnce();
  });
  it("closes a late capability/socket after stop and survives projection errors", async () => {
    const d = lifecycleSetup();
    let resolve!: (c: { close: typeof d.close }) => void;
    d.connect.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    d.controller.start();
    await flush();
    d.controller.stop();
    resolve({ close: d.close });
    await flush();
    expect(d.close).toHaveBeenCalledOnce();
    const other = lifecycleSetup();
    other.refresh.mockRejectedValueOnce(Error("offline"));
    other.controller.start();
    await flush();
    other.message(event(1));
    await flush();
    other.message(event(2));
    await flush();
    expect(other.refresh).toHaveBeenCalledTimes(2);
    other.controller.stop();
  });
});
it("prepared SQL guards privacy/write policies and covers authoritative worker version updates (static review only)", () => {
  const sql = readFileSync("docs/realtime-sql/proposed-setup.sql", "utf8");
  expect(sql).toContain("enabled boolean not null default false");
  expect(sql).toContain("as restrictive for insert");
  expect(sql).toContain("s.revoked_at is null");
  expect(sql).toContain("s.active_control");
  expect(sql).toContain("after insert or update of state_version,lifecycle");
  expect(sql).toContain("exception when others");
  expect(sql).not.toContain("broadcast_changes");
  expect(sql).not.toContain("new.canonical_state");
  expect(sql).not.toMatch(/alter table realtime.messages/i);
  expect(sql).not.toMatch(/grant.*games.*authenticated/i);
});
