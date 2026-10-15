import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BiribaFinishedScreen } from "./BiribaFinishedScreen";

const props = {
  winningColor: "ΚΟΚΚΙΝΗ",
  winnerNames: ["Γιώργος Νούσιος", "Θεία Ταμάρα"],
  redScore: 5040,
  blueScore: 3640,
  error: "",
  busy: false,
  isHost: true,
  onHome: vi.fn(),
  onNewGame: vi.fn(),
};

describe("Biriba compact game-finished view", () => {
  it("keeps the result details and places home before new game in one action row", () => {
    const view = render(<BiribaFinishedScreen {...props} />);
    expect(screen.getByRole("heading", { name: "Τέλος παιχνιδιού" })).toBeTruthy();
    expect(screen.getByText("Νικήτρια: ΚΟΚΚΙΝΗ ΟΜΑΔΑ")).toBeTruthy();
    expect(screen.getByText("Γιώργος Νούσιος · Θεία Ταμάρα")).toBeTruthy();
    expect(screen.getByText(/Κόκκινη: 5.040 · Μπλε: 3.640/)).toBeTruthy();
    const actions = view.container.querySelector(".biriba-finish-buttons");
    expect(actions).not.toBeNull();
    expect([...actions!.querySelectorAll("button")].map(button => button.textContent?.trim())).toEqual([
      "Αρχική", "Νέο παιχνίδι",
    ]);
    expect(view.container.querySelector(".biriba-finish-panel")).not.toBeNull();
    expect(view.container.querySelector(".biriba-finish-screen")).not.toBeNull();
  });

  it("preserves the two original actions without exchanging handlers", () => {
    const onHome = vi.fn();
    const onNewGame = vi.fn();
    render(<BiribaFinishedScreen {...props} onHome={onHome} onNewGame={onNewGame} />);
    fireEvent.click(screen.getByRole("button", { name: "Αρχική" }));
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onNewGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Νέο παιχνίδι" }));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  it("does not offer the host-only rematch action to guests", () => {
    const view = render(<BiribaFinishedScreen {...props} isHost={false} />);
    expect(screen.getByRole("button", { name: "Αρχική" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Νέο παιχνίδι" })).toBeNull();
    expect(view.container.querySelectorAll(".biriba-finish-buttons > button")).toHaveLength(1);
  });

  it("disables both buttons during submission", () => {
    const onHome = vi.fn();
    const onNewGame = vi.fn();
    render(<BiribaFinishedScreen {...props} busy onHome={onHome} onNewGame={onNewGame} />);
    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons.every(button => button.disabled)).toBe(true);
    buttons.forEach(button => fireEvent.click(button));
    expect(onHome).not.toHaveBeenCalled();
    expect(onNewGame).not.toHaveBeenCalled();
  });

  it("supports draws and a visible error without hiding the actions", () => {
    render(<BiribaFinishedScreen {...props} winningColor={null} winnerNames={[]} error="Αποτυχία δημιουργίας." />);
    expect(screen.getByText("Ισοπαλία")).toBeTruthy();
    expect(screen.queryByText("Παίκτες της νικήτριας ομάδας")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Αποτυχία δημιουργίας.");
    expect(screen.getByRole("button", { name: "Αρχική" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Νέο παιχνίδι" })).toBeTruthy();
  });
});
