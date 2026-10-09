import { assertEquals } from "jsr:@std/assert";

Deno.test("preset voice reaches the authenticated RPC without enabling AI", async () => {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const previousUrl = Deno.env.get("SUPABASE_URL");
  const previousKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const requests: Record<string, unknown>[] = [];
  let rpcResponse: Record<string, unknown> = { ok: true, room: { seats: [] } };
  try {
    Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9999");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-only-key");
    Object.defineProperty(Deno, "serve", { configurable: true, value: (callback: typeof handler) => { handler = callback; } });
    globalThis.fetch = (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Promise.resolve(new Response(JSON.stringify(rpcResponse), { headers: { "Content-Type": "application/json" } }));
    };
    await import("./index.ts");
    const body = { action: "create", sessionToken: "a".repeat(64), actionId: crypto.randomUUID(), rulesetId: "popular", botsTalk: true, allowProfanity: false, aiEnabled: false, ttsEnabled: true, showDialogueText: false, intensity: "normal" };
    const call = (data: Record<string, unknown>) => handler!(new Request("http://localhost", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }));
    assertEquals((await call(body)).status, 200);
    assertEquals(requests[0].p_ai_enabled, false);
    assertEquals(requests[0].p_tts_enabled, true);
    assertEquals(requests[0].p_show_dialogue_text, false);
    rpcResponse = { ok: false, code: "NOT_HOST" };
    assertEquals((await call(body)).status, 403);
    assertEquals((await call({ ...body, botsTalk: false })).status, 400);
    assertEquals((await call({ ...body, ttsEnabled: false })).status, 400);
    assertEquals((await call({ ...body, sessionToken: "invalid" })).status, 401);
    assertEquals(requests.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(Deno, "serve", { configurable: true, value: originalServe });
    if (previousUrl == null) Deno.env.delete("SUPABASE_URL"); else Deno.env.set("SUPABASE_URL", previousUrl);
    if (previousKey == null) Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY"); else Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", previousKey);
  }
});
