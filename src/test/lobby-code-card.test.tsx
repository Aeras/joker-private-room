import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoomCodeCard } from "@/components/joker/RoomCodeCard";
it("offers only code copying inside the room card and copies the exact code", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<RoomCodeCard code="VPRJ" />);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /Αντιγραφή συνδέσμου/ })).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Αντιγραφή κωδικού" })));
  expect(writeText).toHaveBeenCalledExactlyOnceWith("VPRJ");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });