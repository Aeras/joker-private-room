import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { t } from "@/i18n/el";
const mocks = vi.hoisted(() => ({ actor: { id: "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c", displayName: "Owner", role: "host" }, create: vi.fn(), navigate: vi.fn(), refresh: vi.fn(async () => ({ ok: true, activeGame: null })) }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => ({ options }), useNavigate: () => mocks.navigate }));
vi.mock("@/components/joker/ScreenShell", () => ({ ScreenShell: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => <div>{children}{footer}</div>, SectionLabel: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/useCurrentActiveGame", () => ({ useCurrentActiveGame: () => ({ status: "none", activeGame: null, refresh: mocks.refresh }) }));
vi.mock("@/services/realIdentity", () => ({ realIdentityService: { listPlayers: async () => [mocks.actor], verifyPin: async () => ({ ok: true, player: mocks.actor }) } }));
vi.mock("@/services/roomFunctions", () => ({ createProductionRoom: mocks.create, getAvailableRulesets: async () => ({ ok: true, options: [{ id: "popular", name: "Popular", description: "Default" }] }) }));
vi.mock("@/services/authFunctions", () => ({ getCurrentPlayer: async () => null }));
import { Route } from "@/routes/create";
const Create = Route.options.component!;
afterEach(() => { cleanup(); vi.clearAllMocks(); });
async function unlock() {
  const view = render(<Create />);
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(mocks.actor.id));
  fireEvent.change(view.container.querySelector('input[type="password"]')!, { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Συνέχεια" }));
  await screen.findByLabelText(t.botsTalk);
  fireEvent.click(screen.getByLabelText(t.botsTalk));
}
describe("owner preset voice settings", () => {
  it("enables voice without AI and keeps it when AI is switched off", async () => {
    mocks.actor.id = "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c";
    mocks.create.mockResolvedValue({ ok: true, room: { code: "TEST" } });
    await unlock();
    expect(screen.getByLabelText(t.useAiBanter)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(t.botVoice));
    fireEvent.click(screen.getByLabelText(t.showBotMessages));
    fireEvent.click(screen.getByLabelText(t.useAiBanter)); fireEvent.click(screen.getByLabelText(t.useAiBanter));
    expect(screen.getByLabelText(t.botVoice)).toBeChecked();
    expect(screen.getByLabelText(t.showBotMessages)).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: t.createRoom }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ botsTalk: true, aiEnabled: false, ttsEnabled: true, showDialogueText: false }) }));
    fireEvent.click(screen.getByLabelText(t.botVoice));
    expect(screen.queryByLabelText(t.showBotMessages)).toBeNull();
  });
  it("never shows owner voice or message visibility controls to another host", async () => {
    mocks.actor.id = "12302475-c4da-491c-9081-08c039384ac1";
    await unlock();
    expect(screen.queryByLabelText(t.useAiBanter)).toBeNull();
    expect(screen.queryByLabelText(t.botVoice)).toBeNull();
    expect(screen.queryByLabelText(t.showBotMessages)).toBeNull();
  });
});
