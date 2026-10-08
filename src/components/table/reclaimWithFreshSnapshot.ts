import type { PlayerGameProjection } from "@/domain/projection";
import type { ReclaimGameControlResult } from "@/services/gameProjectionFunctions";

/** Retry only a definitive CAS rejection; never replay an ambiguous delivery with a new ID. */
export async function reclaimWithFreshSnapshot(args: {
  gameId: string;
  current: () => PlayerGameProjection | null;
  refresh: () => Promise<void>;
  send: (input: { data: { gameId: string; actionId: string; expectedStateVersion: number } }) => Promise<ReclaimGameControlResult>;
}): Promise<ReclaimGameControlResult | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const projection = args.current();
    if (!projection || projection.gameId !== args.gameId || projection.lifecycle !== "active" || !projection.local.reclaimAvailable) return null;
    const result = await args.send({ data: {
      gameId: args.gameId,
      actionId: crypto.randomUUID(),
      expectedStateVersion: projection.stateVersion,
    } });
    if (result.ok || result.code !== "STALE_STATE" || attempt === 2) return result;
    await args.refresh();
  }
  return null;
}
