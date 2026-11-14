import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurakTableMenu } from "@/durak/DurakTableMenu";
import { durakTableText as text } from "@/i18n/durak.el";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function openMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: text.menu }), { key: "Enter" });
  await screen.findByRole("menu");
}
describe("DURAK compact table menu", () => {
  it("offers refresh and fullscreen, without the host command for other players", async () => {
    const onRefresh = vi.fn(),
      onBack = vi.fn();
    render(<DurakTableMenu onBack={onBack} onRefresh={onRefresh} onError={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: text.back }));
    expect(onBack).toHaveBeenCalledOnce();
    await openMenu();
    expect(screen.queryByText(text.endGame)).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: text.refresh }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it("confirms and executes host termination via the in-app dialog", async () => {
    const onEndGame = vi.fn().mockResolvedValue(undefined);
    render(
      <DurakTableMenu
        onBack={() => {}}
        onRefresh={() => {}}
        onEndGame={onEndGame}
        onError={() => {}}
      />,
    );
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: text.endGame }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Επιβεβαίωση" }));
    await vi.waitFor(() => expect(onEndGame).toHaveBeenCalledOnce());
  });
  it("preserves the game when in-app confirmation is cancelled", async () => {
    const onEndGame = vi.fn();
    render(
      <DurakTableMenu
        onBack={() => {}}
        onRefresh={() => {}}
        onEndGame={onEndGame}
        onError={() => {}}
      />,
    );
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: text.endGame }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ακύρωση" }));
    expect(onEndGame).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("reports a failed termination without pretending it succeeded", async () => {
    const onError = vi.fn();
    render(
      <DurakTableMenu
        onBack={() => {}}
        onRefresh={() => {}}
        onEndGame={async () => {
          throw Error("failed");
        }}
        onError={onError}
      />,
    );
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: text.endGame }));
    fireEvent.click(screen.getByRole("button", { name: "Επιβεβαίωση" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(text.endFailed));
    expect(screen.getByRole("alert")).toHaveTextContent(text.endFailed);
  });
  it("requests fullscreen on a user action and follows fullscreenchange", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    render(<DurakTableMenu onBack={() => {}} onRefresh={() => {}} onError={() => {}} />);
    const toggle = screen.getByRole("button", { name: text.fullscreen });
    expect(toggle.textContent).toBe("");
    fireEvent.click(toggle);
    expect(request).toHaveBeenCalledOnce();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.documentElement,
    });
    fireEvent(document, new Event("fullscreenchange"));
    expect(screen.getByRole("button", { name: text.exitFullscreen }).textContent).toBe("");
    await openMenu();
    expect(screen.getByRole("menuitem", { name: text.exitFullscreen })).toBeInTheDocument();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });
});
