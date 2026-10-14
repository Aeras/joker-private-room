import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BiribaRoomControls } from "./BiribaRoomControls";

afterEach(cleanup);

describe("Biriba room controls", () => {
  it("shows fullscreen to all players and the end-game menu only to the host", () => {
    const onEndGame = vi.fn(async () => true);
    const { rerender } = render(
      <BiribaRoomControls isHost={false} busy={false} onEndGame={onEndGame} />,
    );
    expect(screen.getByRole("button", { name: "Πλήρης οθόνη" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Μενού παιχνιδιού" })).toBeNull();

    rerender(<BiribaRoomControls isHost busy={false} onEndGame={onEndGame} />);
    expect(screen.getByRole("button", { name: "Μενού παιχνιδιού" })).toBeTruthy();
  });

  it("requires confirmation before calling the server action", async () => {
    const onEndGame = vi.fn(async () => true);
    render(<BiribaRoomControls isHost busy={false} onEndGame={onEndGame} />);
    fireEvent.click(screen.getByRole("button", { name: "Μενού παιχνιδιού" }));
    fireEvent.click(screen.getByRole("button", { name: "Τέλος παιχνιδιού" }));
    expect(screen.getByRole("dialog", { name: "Τέλος παιχνιδιού;" })).toBeTruthy();
    expect(onEndGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Άκυρο" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onEndGame).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Μενού παιχνιδιού" }));
    fireEvent.click(screen.getByRole("button", { name: "Τέλος παιχνιδιού" }));
    fireEvent.click(screen.getByRole("button", { name: "Επιβεβαίωση" }));
    await waitFor(() => expect(onEndGame).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the confirmation open when the server rejects the request", async () => {
    const onEndGame = vi.fn(async () => false);
    render(<BiribaRoomControls isHost busy={false} onEndGame={onEndGame} />);
    fireEvent.click(screen.getByRole("button", { name: "Μενού παιχνιδιού" }));
    fireEvent.click(screen.getByRole("button", { name: "Τέλος παιχνιδιού" }));
    fireEvent.click(screen.getByRole("button", { name: "Επιβεβαίωση" }));
    await waitFor(() => expect(onEndGame).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Τέλος παιχνιδιού;" })).toBeTruthy();
  });

  it("toggles the shared fullscreen control in both directions", async () => {
    let fullscreen = false;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => (fullscreen ? document.documentElement : null),
    });
    const request = vi.fn(async () => {
      fullscreen = true;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exit = vi.fn(async () => {
      fullscreen = false;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: request,
    });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    try {
      render(<BiribaRoomControls isHost={false} busy={false} onEndGame={async () => true} />);
      fireEvent.click(screen.getByRole("button", { name: "Πλήρης οθόνη" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Έξοδος από πλήρη οθόνη" })).toBeTruthy(),
      );
      fireEvent.click(screen.getByRole("button", { name: "Έξοδος από πλήρη οθόνη" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Πλήρης οθόνη" })).toBeTruthy(),
      );
      expect(request).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
      Reflect.deleteProperty(document, "exitFullscreen");
      Reflect.deleteProperty(document, "fullscreenElement");
    }
  });
});
