import type { DurakCard, DurakRank, DurakSuit } from "@/durak/rules";
import { assets } from "@/assets/registry";

export const RANK_NAMES: Record<DurakRank, string> = {
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "jack",
  12: "queen",
  13: "king",
  14: "ace",
};

export function getDurakCardKey(card: DurakCard): string {
  return `${card.suit}_${card.rank}`;
}

export function getDurakCardFaceUrl(card: DurakCard): string {
  const rankName = RANK_NAMES[card.rank];
  const pngUrl = `/cards/runtime-png/faces/${card.suit}_${rankName}.png`;
  return assets.cardArtwork(pngUrl);
}

export function getDurakCardBackUrl(): string {
  return assets.cardArtwork(assets.cardBack);
}

export function getDurakTableArtUrl(): string {
  return assets.tableArt;
}
