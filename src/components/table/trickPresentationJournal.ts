import type { PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";

export interface PresentedTrick {
  id: string;
  dealNumber: number;
  ordinal: number;
  cards: PlayedCard[];
  winnerSeat: 0 | 1 | 2 | 3 | null;
  hydrated: boolean;
}
export const MAX_PRESENTATION_BACKLOG = 24;
export class TrickPresentationJournal {
  readonly queue: PresentedTrick[] = [];
  private readonly seen = new Set<string>();
  private initialized = false;
  catchups = 0;
  get active() { return this.queue[0] ?? null; }

  ingest(projection: PlayerGameProjection) {
    const before = JSON.stringify(this.queue);
    const complete = [
      ...(projection.cards.presentationTail ?? []),
      ...projection.cards.completedTricks.map((trick, index) => ({ ...trick, dealNumber: projection.progression.dealNumber, ordinal: index + 1 })),
    ].sort((a, b) => a.dealNumber - b.dealNumber || a.ordinal - b.ordinal);
    const add = (dealNumber: number, ordinal: number, cards: PlayedCard[], winnerSeat: PresentedTrick["winnerSeat"], hydrated = false) => {
      const id = `${projection.gameId}:${dealNumber}:${ordinal}`;
      const existing = this.queue.find(trick => trick.id === id);
      if (existing) { existing.cards = cards.map(play => ({ ...play, card: { ...play.card } })); existing.winnerSeat = winnerSeat; return; }
      if (this.seen.has(id)) return;
      this.seen.add(id);
      this.queue.push({ id, dealNumber, ordinal, cards: cards.map(play => ({ ...play, card: { ...play.card } })), winnerSeat, hydrated });
    };
    if (!this.initialized) {
      this.initialized = true;
      // A fresh/reconnected mount is an explicit settled snapshot, not unbounded historical replay.
      for (const trick of complete) this.seen.add(`${projection.gameId}:${trick.dealNumber}:${trick.ordinal}`);
      if (projection.cards.currentTrick.length) add(projection.progression.dealNumber, projection.cards.completedTricks.length + 1, projection.cards.currentTrick, null, true);
    } else {
      for (const trick of complete) add(trick.dealNumber, trick.ordinal, trick.cards, trick.winnerSeat);
      if (projection.cards.currentTrick.length) add(projection.progression.dealNumber, projection.cards.completedTricks.length + 1, projection.cards.currentTrick, null);
    }
    if (this.queue.length > MAX_PRESENTATION_BACKLOG) {
      // Long absence has a bounded settled-snapshot recovery policy; normal live batches are retained.
      const latest = this.queue.at(-1)!;
      latest.hydrated = true;
      this.queue.splice(0, this.queue.length, latest);
      this.catchups++;
    }
    while (this.seen.size > 96) this.seen.delete(this.seen.values().next().value!);
    return before !== JSON.stringify(this.queue);
  }
  collect(id: string) { if (this.active?.id === id) this.queue.shift(); }
}
