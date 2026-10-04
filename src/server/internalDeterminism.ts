const UINT32_RANGE = 0x1_0000_0000;

async function digest(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function stableInternalActionId(gameId: string, label: string): Promise<string> {
  const bytes = (await digest(`jk001:${label}:${gameId}`)).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function deterministicRandomUnits(
  gameId: string,
  label: string,
  count: number,
): Promise<number[]> {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");
  const result: number[] = [];
  let counter = 0;
  while (result.length < count) {
    const bytes = await digest(`jk001:${label}:${gameId}:${counter}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 4 <= bytes.byteLength && result.length < count; offset += 4) {
      result.push(view.getUint32(offset, false) / UINT32_RANGE);
    }
    counter += 1;
  }
  return result;
}

export function randomIterator(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    if (value == null) throw new Error("Deterministic random stream exhausted");
    index += 1;
    return value;
  };
}
