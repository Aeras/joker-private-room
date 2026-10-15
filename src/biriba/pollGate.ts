/** One active projection refresh per table. A slow request never queues more polls. */
export function createBiribaPollGate() {
  let running = false;
  let stopped = false;
  let count = 0;
  return {
    async run(work: (count: number) => Promise<void>): Promise<boolean> {
      if (running || stopped) return false;
      running = true;
      try {
        await work(count++);
        return true;
      } finally {
        running = false;
      }
    },
    stop() { stopped = true; },
  };
}
