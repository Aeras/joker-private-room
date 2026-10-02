import { useEffect, useState } from "react";
import { EPHEMERAL_MESSAGE_TTL_MS, type EphemeralChannel, type EphemeralMessage } from "@/services/ephemeral";

/** Active speech bubbles; each disappears after the TTL. Nothing is stored. */
export function useEphemeralBubbles(channel: EphemeralChannel) {
  const [bubbles, setBubbles] = useState<EphemeralMessage[]>([]);
  useEffect(
    () =>
      channel.subscribe((m) => {
        setBubbles((b) => [...b.filter((x) => x.fromSeat !== m.fromSeat), m]);
        setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== m.id)), EPHEMERAL_MESSAGE_TTL_MS);
      }),
    [channel],
  );
  return bubbles;
}
