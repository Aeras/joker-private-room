import type { TableMessage } from "@/services/tableMessageFunctions";
export interface LiveTableMessage extends TableMessage {
  localExpiresAt: number;
}
/** Conservative clock-offset handling: network delay consumes TTL; receipt never restarts it. */
export function mergeLiveTableMessages(
  previous: LiveTableMessage[],
  incoming: TableMessage[],
  serverNow: string,
  requestStartedAt: number,
  now: number,
): LiveTableMessage[] {
  const byId = new Map(previous.filter((m) => m.localExpiresAt > now).map((m) => [m.id, m]));
  for (const message of incoming) {
    const remaining = Date.parse(message.expiresAt) - Date.parse(serverNow);
    const deadline = requestStartedAt + remaining;
    const existing = byId.get(message.id);
    const localExpiresAt = existing ? Math.min(existing.localExpiresAt, deadline) : deadline;
    if (Number.isFinite(localExpiresAt) && localExpiresAt > now)
      byId.set(message.id, { ...message, localExpiresAt });
  }
  return [...byId.values()].filter((m) => m.localExpiresAt > now);
}
