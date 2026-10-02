import { useEffect, useState } from "react";

/** Countdown that restarts whenever resetKey changes. Stops at 0 (no timeout rules yet). */
export function useTurnTimer(durationSeconds: number, resetKey: unknown, running = true) {
  const [remaining, setRemaining] = useState(durationSeconds);
  useEffect(() => {
    setRemaining(durationSeconds);
    if (!running) return;
    const id = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [durationSeconds, resetKey, running]);
  return remaining;
}
