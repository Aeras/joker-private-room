import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const route = readFileSync(resolve(process.cwd(),"src/routes/durak.tsx"),"utf8");
describe("DURAK rooms do not require sharing a code",()=>{
  it("does not show generated room codes as a lobby heading",()=>{
    expect(route).not.toContain("Δωμάτιο {room.code}");
    expect(route).toContain("Δωμάτιο DURAK");
  });
  it("continues to use internal code only for authorized room commands",()=>{
    expect(route).toContain('run("get",room.code)');
    expect(route).toContain('run("leave",room.code)');
    expect(route).toContain('run("join",item.code)');
  });
});
