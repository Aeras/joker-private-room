/** Retry ambiguous delivery once using exactly the same CAS/action ID envelope. */
export async function retryCommandDelivery<TInput, TResult>(
  send: (input: TInput) => Promise<TResult>,
  input: TInput,
): Promise<TResult> {
  try {
    return await send(input);
  } catch {
    return await send(input);
  }
}

