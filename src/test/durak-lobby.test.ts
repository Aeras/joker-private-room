import { describe, expect, it } from "vitest";
import { createDurakLobbyPreview, previewAssignBot, previewRemoveBot } from "@/durak/lobby";
describe("isolated DURAK lobby model", () => {
  it.each([2,3,4,5,6])("creates exactly %i seats", n => {
    const lobby=createDurakLobbyPreview("Host","podkidnoy",n);
    expect(lobby.game).toBe("durak");
    expect(lobby.seats).toHaveLength(n);
    expect(lobby.seats[0]?.name).toBe("Host");
  });
  it("rejects invalid capacities", () => {
    expect(() => createDurakLobbyPreview("Host","podkidnoy",7)).toThrow();
  });
  it("assigns and clears only non-human seats", () => {
    const lobby=createDurakLobbyPreview("Host","perevodnoy",5);
    expect(() => previewAssignBot(lobby,0,"Alex")).toThrow();
    const assigned=previewAssignBot(lobby,2,"Alex");
    expect(assigned.seats[2]?.occupant).toBe("bot");
    expect(lobby.seats[2]?.occupant).toBe("empty");
    expect(previewRemoveBot(assigned,2).seats[2]?.occupant).toBe("empty");
  });
  it("rejects bot duplicates", () => {
    const lobby=previewAssignBot(createDurakLobbyPreview("Host","podkidnoy",4),1,"Alex");
    expect(() => previewAssignBot(lobby,2,"Alex")).toThrow();
  });
});
