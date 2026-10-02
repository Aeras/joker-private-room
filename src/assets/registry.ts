/**
 * Visual asset registry. Final artwork (avatars, card faces, card back,
 * Joker, table art) will be supplied later — set URLs/imports here and
 * components pick them up automatically. undefined = use placeholder.
 */
import type { Card } from "@/domain/cards";

export const assets = {
  cardBack: undefined as string | undefined,
  tableArt: undefined as string | undefined,
  /** Return an image for a card face, or undefined for the placeholder. */
  cardFace: (_card: Card): string | undefined => undefined,
  /** Player/bot avatar by id, or undefined for the placeholder. */
  avatar: (_id: string): string | undefined => undefined,
};
