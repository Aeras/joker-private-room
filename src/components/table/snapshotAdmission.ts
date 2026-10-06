/** One instance per route generation. Canonical versions never move backwards. */
export class SnapshotAdmission {
  constructor(readonly routeKey = "") {}
  private version = -1;
  private request = 0;
  private lastSuccess = 0;

  beginRequest() {
    return { sequence: ++this.request, version: this.version };
  }

  admit(version: number, sequence = this.request): boolean {
    if (!Number.isSafeInteger(version) || version < this.version || (version === this.version && sequence < this.lastSuccess)) return false;
    this.version = version;
    this.lastSuccess = Math.max(this.lastSuccess, sequence);
    return true;
  }

  acceptsFailure(token: { sequence: number; version: number }): boolean {
    return token.sequence >= this.lastSuccess && token.version >= this.version;
  }
}
