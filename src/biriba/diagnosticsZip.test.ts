import { describe, expect, it } from "vitest";
import { createDiagnosticZip } from "./diagnosticsZip";

describe("Biriba Black Box ZIP export", () => {
  it("produces a valid file with local and central ZIP records", async () => {
    const zip = createDiagnosticZip({
      "REPORT.md": "# Biriba\n",
      "timeline.json": '[{"kind":"action_start"}]',
    });
    expect(zip.type).toBe("application/zip");
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(2);
    expect(new TextDecoder().decode(bytes)).toContain("REPORT.md");
    expect(new TextDecoder().decode(bytes)).toContain("timeline.json");
  });

  it("rejects traversal paths for diagnostic entries", () => {
    expect(() => createDiagnosticZip({ "../private.json": "{}" })).toThrow("Invalid diagnostic filename");
  });
});
