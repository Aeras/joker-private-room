import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DurakWaitingSeats } from "@/durak/DurakWaitingSeats";
import { CANONICAL_BOTS } from "../../supabase/functions/_shared/bot-catalog";
import type { DurakSeatView } from "@/services/durakRoomFunctions";
afterEach(cleanup);
const seats: DurakSeatView[] = [
  { index: 0, occupant: "human", name: "Git" },
  { index: 1, occupant: "empty", name: null },
  { index: 2, occupant: "bot", name: CANONICAL_BOTS[0]!.displayName },
  { index: 3, occupant: "empty", name: null },
];
it("shows real artwork and assigns a chosen canonical bot to the tapped seat", async () => {
  const select = vi.fn(async () => {});
  const result = render(
    <DurakWaitingSeats seats={seats} host busy={false} onSelect={select} onRemove={vi.fn()} />,
  );
  expect(result.container.querySelector('img[alt="Git"]')?.getAttribute("src")).toBe(
    "/avatars/git2.png",
  );
  expect(
    result.container
      .querySelector(`img[alt="${CANONICAL_BOTS[0]!.displayName}"]`)
      ?.getAttribute("src"),
  ).toBe("/avatars/table/giorgos_nousios.webp");
  fireEvent.click(screen.getByRole("button", { name: "Επιλογή bot για τη θέση 4" }));
  expect(screen.getByRole("button", { name: CANONICAL_BOTS[0]!.displayName })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: CANONICAL_BOTS[1]!.displayName }));
  expect(select).toHaveBeenCalledExactlyOnceWith(3, CANONICAL_BOTS[1]!.id);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("lets the host replace or remove a bot, but never edit a human seat", async () => {
  const remove = vi.fn(async () => {});
  render(
    <DurakWaitingSeats seats={seats} host busy={false} onSelect={vi.fn()} onRemove={remove} />,
  );
  expect(screen.queryByRole("button", { name: "Επιλογή bot για τη θέση 1" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Επιλογή bot για τη θέση 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Αφαίρεση bot" }));
  expect(remove).toHaveBeenCalledExactlyOnceWith(2);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("does not expose setup controls to a guest", () => {
  render(
    <DurakWaitingSeats
      seats={seats}
      host={false}
      busy={false}
      onSelect={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
