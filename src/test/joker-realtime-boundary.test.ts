import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const cookie = { value: "a".repeat(64) };
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  const client = {
    channel: vi.fn(() => channel),
    removeAllChannels: vi.fn(async () => []),
    realtime: { setAuth: vi.fn(async () => {}), disconnect: vi.fn() },
  };
  return { cookie, channel, client, createClient: vi.fn(() => client), header: vi.fn() };
});
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (h: unknown) => h }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => mocks.cookie.value,
  setResponseHeader: mocks.header,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { getRealtimeCapability } from "@/services/realtimeFunctions";
import { openReceiveSocket } from "@/services/realtime/socket";
const game = "00000000-0000-4000-8000-000000000201";
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mocks.cookie.value = "a".repeat(64);
});
describe("same-origin broker boundary", () => {
  it("is off by default and never sends the session or accesses Supabase", async () => {
    vi.stubEnv("JOKER_REALTIME_ENABLED", "false");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await getRealtimeCapability({ data: { gameId: game } })).toEqual({
      ok: false,
      code: "DISABLED",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.header).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it("requires the existing HttpOnly session and sends only a narrowly scoped server request", async () => {
    vi.stubEnv("JOKER_REALTIME_ENABLED", "true");
    mocks.cookie.value = "";
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: false, code: "NOT_MEMBER" }), { status: 403 }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await getRealtimeCapability({ data: { gameId: game } })).toEqual({
      ok: false,
      code: "NOT_AUTHENTICATED",
    });
    expect(fetch).not.toHaveBeenCalled();
    mocks.cookie.value = "a".repeat(64);
    expect(await getRealtimeCapability({ data: { gameId: game } })).toEqual({
      ok: false,
      code: "NOT_MEMBER",
    });
    const options = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(options[1].body))).toEqual({
      action: "realtime_capability",
      gameId: game,
      sessionToken: mocks.cookie.value,
    });
    expect(JSON.stringify(options)).not.toContain("service_role");
  });
});
it("creates an isolated private receive-only client and disposes all channel/socket resources", async () => {
  const token = "test.jwt.token",
    message = vi.fn(),
    status = vi.fn();
  const c = await openReceiveSocket(
    { gameId: game, token, topic: "test-topic", expiresAt: Date.now() + 90_000 },
    message,
    status,
  );
  expect(mocks.createClient).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringMatching(/^sb_publishable/),
    {
      accessToken: expect.any(Function),
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
  expect(mocks.client.realtime.setAuth).toHaveBeenCalledWith(token);
  expect(mocks.client.channel).toHaveBeenCalledWith("test-topic", {
    config: { private: true, broadcast: { self: false } },
  });
  expect(mocks.channel.on).toHaveBeenCalledWith(
    "broadcast",
    { event: "joker_state_changed" },
    expect.any(Function),
  );
  expect(mocks.channel.subscribe).toHaveBeenCalledWith(status);
  const options = (
    mocks.createClient.mock.calls as unknown as [
      string,
      string,
      { accessToken(): Promise<string | null> },
    ][]
  )[0]![2];
  expect(await options.accessToken()).toBe(token);
  c.close();
  expect(await options.accessToken()).toBeNull();
  c.close();
  expect(mocks.client.removeAllChannels).toHaveBeenCalledOnce();
  expect(mocks.client.realtime.disconnect).toHaveBeenCalledOnce();
});
