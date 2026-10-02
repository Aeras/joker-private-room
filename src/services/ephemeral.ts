/**
 * Ephemeral table messages. No history, no persistence.
 * Production: swap the local channel for a realtime broadcast channel.
 */
export const EPHEMERAL_MESSAGE_TTL_MS = 5000;
export const EPHEMERAL_MESSAGE_MAX_LENGTH = 80;

export interface EphemeralMessage {
  id: string;
  fromSeat: number;
  to: number | "all";
  text: string;
  sentAt: number;
}

export interface EphemeralChannel {
  send(msg: Omit<EphemeralMessage, "id" | "sentAt">): void;
  subscribe(cb: (msg: EphemeralMessage) => void): () => void;
}

export function createLocalEphemeralChannel(): EphemeralChannel {
  const listeners = new Set<(m: EphemeralMessage) => void>();
  return {
    send(msg) {
      const full: EphemeralMessage = {
        ...msg,
        text: msg.text.slice(0, EPHEMERAL_MESSAGE_MAX_LENGTH),
        id: Math.random().toString(36).slice(2),
        sentAt: Date.now(),
      };
      listeners.forEach((l) => l(full));
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
