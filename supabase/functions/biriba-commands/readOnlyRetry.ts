/** Retry only an interrupted read. Mutating RPCs must never use this helper. */
export async function retryTimedOutRead<T extends { data: unknown; error: unknown }>(
  read: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 4_000,
): Promise<{ result: T; attempts: number }> {
  for (let attempts = 1; attempts <= 2; attempts++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await read(controller.signal);
      if (!controller.signal.aborted || !result.error || attempts === 2)
        return { result, attempts };
    } catch (error) {
      if (!controller.signal.aborted || attempts === 2) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Read retry exhausted");
}
