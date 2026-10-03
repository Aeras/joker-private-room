/** Visual asset registry for the private Joker room. */
import type { Card } from "@/domain/cards";

const avatarByName: Record<string, string> = {
  giobis: "/avatars/giobis.webp",
  nikos: "/avatars/giobis.webp",
  "νίκος": "/avatars/giobis.webp",
  mixalis: "/avatars/mixalis.webp",
  "μιχάλης": "/avatars/mixalis.webp",
  git: "/avatars/git.webp",
  panagiotis: "/avatars/git.webp",
  "παναγιώτης": "/avatars/git.webp",
  "θεία ταμάρα": "/avatars/bots/tamara.webp",
  "γκρίσα ο ύποπτος": "/avatars/bots/grisha.webp",
  "σερζ ο μαθηματικός": "/avatars/bots/serge.webp",
  "βαλέρια η επικίνδυνη": "/avatars/bots/valeria.webp",
  "μπάμπης ο χαλαρός": "/avatars/bots/babis.webp",
  "καπετάνιος": "/avatars/bots/captain.webp",
};

export const assets = {
  cardBack: "/cards/back-red.webp",
  tableArt: "/table/joker-room.webp",
  cardFace: (_card: Card): string | undefined => undefined,
  avatar: (_id: string, displayName?: string): string | undefined => {
    const key = displayName?.trim().toLowerCase();
    return key ? avatarByName[key] : undefined;
  },
};
