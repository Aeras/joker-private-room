import { describe, expect, it } from "vitest";
import { SnapshotAdmission } from "@/components/table/snapshotAdmission";

describe("monotonic snapshot admission", () => {
  it("rejects v9 after v10 and a v10 poll after a v11 command", () => {
    const admission = new SnapshotAdmission();
    expect(admission.admit(10)).toBe(true);
    expect(admission.admit(9)).toBe(false);
    expect(admission.admit(11)).toBe(true);
    expect(admission.admit(10)).toBe(false);
  });
  it("accepts equal-version metadata without allowing an old failure to disconnect", () => {
    const admission = new SnapshotAdmission();
    admission.admit(10);
    const old = admission.beginRequest();
    const fresh = admission.beginRequest();
    admission.admit(10, fresh.sequence);
    expect(admission.acceptsFailure(old)).toBe(false);
    expect(admission.admit(10, old.sequence)).toBe(false); // Older equal-version metadata is not valid.
    expect(admission.admit(10)).toBe(true);
    admission.admit(11);
    expect(admission.acceptsFailure(fresh)).toBe(false);
  });
  it("gives a new route/reconnect generation independent version ownership", () => {
    const old = new SnapshotAdmission(); old.admit(100);
    const next = new SnapshotAdmission();
    expect(next.admit(1)).toBe(true);
    expect(old.admit(99)).toBe(false);
  });
});
