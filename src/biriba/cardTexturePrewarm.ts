import { Assets } from "pixi.js";
import type { BiribaCard } from "./rules";
import { biribaCardArtwork } from "./biribaVisualModel";

/** Warm the selected face while the player decides what to do with the card. */
export function prewarmBiribaCardTexture(card: BiribaCard) {
  void Assets.load(biribaCardArtwork(card)).catch(() => {
    // A failed warmup does not affect the authoritative move or its fallback.
  });
}
