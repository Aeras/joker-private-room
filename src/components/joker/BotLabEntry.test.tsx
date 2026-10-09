import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  route: null as null | { beforeLoad: () => Promise<unknown> },
}));
vi.mock("@/services/botLabFunctions", () => ({ botLabRequest: mocks.request }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  redirect: (options: unknown) => ({ redirect: options }),
  createFileRoute: () => (config: typeof mocks.route) => {
    mocks.route = config;
    return config;
  },
}));
import { BotLabEntry } from "./BotLabEntry";
import "@/routes/bot-lab";
afterEach(() => {
  cleanup();
  mocks.request.mockReset();
});
it("hides the entry when server authorization denies access", async () => {
  mocks.request.mockResolvedValue({ ok: false, code: "ADMIN_REQUIRED" });
  render(<BotLabEntry />);
  await waitFor(() => expect(mocks.request).toHaveBeenCalled());
  expect(screen.queryByText("Bot Lab")).not.toBeInTheDocument();
});
it("shows the entry only after verified server authorization", async () => {
  mocks.request.mockResolvedValue({ ok: true, json: '{"allowed":true}' });
  render(<BotLabEntry />);
  expect(await screen.findByText("Bot Lab")).toHaveAttribute("href", "/bot-lab");
});
it("manual route navigation is denied before loading Lab data", async () => {
  mocks.request.mockResolvedValue({ ok: false, code: "ADMIN_REQUIRED" });
  await expect(mocks.route!.beforeLoad()).rejects.toEqual({ redirect: { to: "/" } });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledWith({ data: { action: "access" } });
});
