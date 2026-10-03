import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

async function resolveAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  await router.load();
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// Document-level TanStack Start shells render <html>/<head>/<body> and must not
// be mounted inside Testing Library's default <div>. This smoke test verifies
// that the real route tree resolves both normal and not-found locations without
// changing application rendering behavior.
describe("App routing", () => {
  it("resolves the index route", async () => {
    const router = await resolveAt("/");
    expect(router.state.matches.length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/");
  });

  it("resolves the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const router = await resolveAt("/this-route-does-not-exist");
    expect(router.state.matches.length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/this-route-does-not-exist");
  });
});
