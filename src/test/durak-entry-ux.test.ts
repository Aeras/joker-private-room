import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const route=readFileSync(resolve(process.cwd(),"src/routes/durak.tsx"),"utf8");
describe("DURAK compact entry UX",()=>{
  it("shows the primary creation action before secondary items",()=>{
    expect(route).toContain("Δημιουργία παιχνιδιού");
    expect(route).not.toContain("Προεπισκόπηση δωματίου");
    expect(route).not.toContain("Κωδικός 6 χαρακτήρων");
  });
  it("provides session-based return, without asking for a code",()=>{
    expect(route).toContain('action:"membership"');
    expect(route).toContain("Επιστροφή στο παιχνίδι μου");
    expect(route).not.toContain("returnCode");
  });
  it("allows vertical overflow on shorter landscape screens",()=>{
    expect(route).toContain("!overflow-y-auto");
    expect(route).toContain("!min-h-0");
  });
  it("uses the DURAK-only room list",()=>{
    expect(route).toContain('run("list")');
    expect(route).toContain('run("join",item.code)');
  });
});
