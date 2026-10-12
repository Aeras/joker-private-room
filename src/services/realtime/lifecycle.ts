import {
  parseInvalidation,
  validCapability,
  type CapabilityResult,
  type RealtimeCapability,
} from "./protocol";
export interface ReceiveConnection {
  close(): void;
}
export interface RealtimeDependencies {
  capability(): Promise<CapabilityResult>;
  connect(
    capability: RealtimeCapability,
    onMessage: (payload: unknown) => void,
    onStatus: (status: string) => void,
  ): Promise<ReceiveConnection>;
  refresh(): Promise<number | null>;
  version(): number;
  now(): number;
  metric(event: string, details: Record<string, number | string | boolean | null>): void;
}
/** One receive-only socket. Authoritative refresh/admission/journal stay in the existing route. */
export class RealtimeLifecycle {
  private generation = 0;
  private connection: ReceiveConnection | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private retry = 0;
  private inFlight = false;
  private queued = false;
  private highest = -1;
  private admitted = -1;
  private seen = new Set<number>();
  private notificationAt: number | null = null;
  constructor(
    private readonly gameId: string,
    private readonly deps: RealtimeDependencies,
  ) {}
  start(): void {
    void this.renew();
  }
  stop(): void {
    this.stopped = true;
    this.generation++;
    this.clear();
    this.connection?.close();
    this.connection = null;
  }
  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.expiry) clearTimeout(this.expiry);
    this.timer = this.expiry = null;
  }
  private schedule(delay: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.renew(), delay);
  }
  private async renew(): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.clear();
    this.connection?.close();
    this.connection = null;
    const current = () => !this.stopped && generation === this.generation;
    try {
      const result = await this.deps.capability();
      if (!current()) return;
      if (!result.ok) {
        if (["DISABLED", "NOT_MEMBER", "NOT_AUTHENTICATED"].includes(result.code)) {
          this.stop();
          return;
        }
        throw new Error("CAPABILITY_UNAVAILABLE");
      }
      const c = result.capability;
      if (!validCapability(c, this.gameId, this.deps.now())) throw new Error("INVALID_CAPABILITY");
      const expiresIn = c.expiresAt - this.deps.now();
      // A suspended/expired socket is discarded even when renewal fails.
      this.expiry = setTimeout(() => {
        if (current()) void this.renew();
      }, expiresIn);
      let failedStatus = false;
      const connection = await this.deps.connect(
        c,
        (payload) => {
          if (current()) this.receive(payload);
        },
        (status) => {
          if (!current()) return;
          this.deps.metric("realtime_status", { status });
          if (status === "SUBSCRIBED") {
            this.retry = 0;
            void this.wake();
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            failedStatus = true;
            this.schedule(Math.min(30_000, 2_000 * 2 ** Math.min(4, this.retry++)));
          }
        },
      );
      if (!current()) {
        connection.close();
        return;
      }
      this.connection = connection;
      if (!failedStatus) this.schedule(Math.max(1_000, expiresIn - 15_000));
    } catch {
      if (current()) {
        this.deps.metric("realtime_unavailable", {});
        this.schedule(Math.min(30_000, 2_000 * 2 ** Math.min(4, this.retry++)));
      }
    }
  }
  private receive(payload: unknown): void {
    const event = parseInvalidation(payload, this.gameId);
    if (
      !event ||
      event.stateVersion <= Math.max(this.admitted, this.deps.version()) ||
      this.seen.has(event.stateVersion)
    )
      return;
    this.seen.add(event.stateVersion);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
    this.highest = Math.max(this.highest, event.stateVersion);
    this.notificationAt = this.deps.now();
    this.deps.metric("realtime_invalidation", { stateVersion: event.stateVersion });
    // Even an implausibly future version causes only a bounded wake, not a retry-until-version loop.
    void this.wake();
  }
  private async wake(): Promise<void> {
    if (this.stopped) return;
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.inFlight = true;
    try {
      for (let attempt = 0; attempt < 2 && !this.stopped; attempt++) {
        this.queued = false;
        const receivedAt = this.notificationAt;
        const version = await this.deps.refresh();
        if (this.stopped) return;
        if (version != null && Number.isSafeInteger(version))
          this.admitted = Math.max(this.admitted, version);
        if (receivedAt != null)
          this.deps.metric("realtime_projection", {
            stateVersion: version,
            durationMs: this.deps.now() - receivedAt,
          });
        if (!this.queued && (version == null || version >= this.highest)) break;
      }
    } catch {
      /* Ordinary polling remains the recovery mechanism. */
    } finally {
      this.highest = Math.max(this.admitted, this.deps.version());
      this.inFlight = false;
      this.queued = false;
    }
  }
}
