import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path: string) => readFileSync(resolve(process.cwd(),path),"utf8");
describe("DURAK online room isolation and authenticated transport",()=>{
  it("uses a dedicated edge function and never the JOKER commands route",()=>{
    const service=read("src/services/durakRoomFunctions.ts");
    expect(service).toContain("/functions/v1/durak-commands");
    expect(service).not.toContain("/functions/v1/room-commands");
    expect(service).toContain("getCookie(");
  });
  it("retains the player session on the server side",()=>{
    const service=read("src/services/durakRoomFunctions.ts");
    const route=read("src/routes/durak.tsx");
    expect(service).toContain("sessionToken");
    expect(route).not.toContain("sessionToken");
    expect(route).toContain("Επιστροφή στο δωμάτιο");
  });
  it("blocks requests without a valid player session",()=>{
    const edge=read("supabase/functions/durak-commands/index.ts");
    expect(edge).toContain("NOT_AUTHENTICATED");
    expect(edge).toContain("durak_room_command_internal");
    expect(edge).not.toContain("room_command_internal");
  });
});