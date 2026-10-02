/** Visual asset registry for the private Joker room. */
import type { Card } from "@/domain/cards";

const avatarByName: Record<string, string> = {
  giobis: "/avatars/giobis.webp",
  mixalis: "/avatars/mixalis.webp",
  git: "/avatars/git.webp",
  panagiotis: "/avatars/git.webp",
};

export const assets = {
  cardBack: undefined as string | undefined,
  tableArt: undefined as string | undefined,
  cardFace: (_card: Card): string | undefined => undefined,
  /** Stable real-player artwork is keyed by display name; bots can still use id-based assets later. */
  avatar: (_id: string, displayName?: string): string | undefined => {
    const key = displayName?.trim().toLowerCase();
    return key ? avatarByName[key] : undefined;
  },
};
