/** Per-device opt-in. PNG is always the safe default. */
export type CardImageFormat = "png" | "webp";
const KEY = "joker-card-image-format-v1";
export const CARD_IMAGE_ADMIN_ID = "a1f36a77-1732-44d4-8c3b-4623a6e6ed0c";
export function cardImageFormat(): CardImageFormat {
  if (typeof window === "undefined") return "png";
  try { return window.localStorage.getItem(KEY) === "webp" ? "webp" : "png"; }
  catch { return "png"; }
}
export function saveCardImageFormat(value: CardImageFormat) {
  try { window.localStorage.setItem(KEY, value); } catch { /* Browser privacy mode. */ }
}
export function isCardImageAdmin(player: { id: string }): boolean {
  return player.id === CARD_IMAGE_ADMIN_ID;
}
