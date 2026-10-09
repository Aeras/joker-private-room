import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: (context: unknown) => unknown) => (input: unknown) => fn(input),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => state.token }));
import { botLabRequest } from "./botLabFunctions";
afterEach(() => {
  state.token = undefined;
  vi.unstubAllGlobals();
});
it("denies missing cookie without calling any backend", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await botLabRequest({ data: { action: "list" } })).toEqual({
    ok: false,
    code: "ADMIN_REQUIRED",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("forwards server cookie and preserves backend authorization denial", async () => {
  state.token = "a".repeat(64);
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: false, json: async () => ({ code: "ADMIN_REQUIRED" }) });
  vi.stubGlobal("fetch", fetch);
  expect(await botLabRequest({ data: { action: "stats", payload: { jobId: "test" } } })).toEqual({
    ok: false,
    code: "ADMIN_REQUIRED",
  });
  const [url, options] = fetch.mock.calls[0]!;
  expect(url).toBe("https://wubrgnzbvtrzbvvqalfw.supabase.co/functions/v1/bot-lab");
  expect(JSON.parse(options.body).sessionToken).toBe(state.token);
});
it("returns only the redacted backend data, not the cookie", async () => {
  state.token = "a".repeat(64);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { jobs: [] } }) }),
  );
  const response = await botLabRequest({ data: { action: "list" } });
  expect(response).toEqual({ ok: true, json: '{"jobs":[]}' });
  expect(JSON.stringify(response)).not.toContain(state.token);
});
