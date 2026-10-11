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
  it("confirms and executes host termination", async () => {
    const onEndGame = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
    await vi.waitFor(() => expect(onEndGame).toHaveBeenCalledOnce());
    expect(window.confirm).toHaveBeenCalledWith(text.confirmEnd);
  });
  it("preserves the game when confirmation is cancelled", async () => {
    const onEndGame = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
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
    expect(onEndGame).not.toHaveBeenCalled();
  });
  it("reports a failed termination without pretending it succeeded", async () => {
    const onError = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(text.endFailed));
  });
  it("requests fullscreen on a user action and follows fullscreenchange", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    render(<DurakTableMenu onBack={() => {}} onRefresh={() => {}} onError={() => {}} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: text.fullscreen }));
    expect(request).toHaveBeenCalledOnce();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.documentElement,
    });
    fireEvent(document, new Event("fullscreenchange"));
    await openMenu();
    expect(screen.getByRole("menuitem", { name: text.exitFullscreen })).toBeInTheDocument();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  });
});
