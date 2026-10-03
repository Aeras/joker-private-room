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
  "θεία ταμάρα": "/avatars/bots/tamara.png",
  "γκρίσα ο ύποπτος": "/avatars/bots/grisa.png",
  "σερζ ο μαθηματικός": "/avatars/bots/serz.png",
  "βαλέρια η επικίνδυνη": "/avatars/bots/valeria.png",
  "μπάμπης ο χαλαρός": "/avatars/bots/babis.png",
  "καπετάνιος": "/avatars/bots/kapetanios.png",
};

export const assets = {
  cardBack: undefined as string | undefined,
  tableArt: "/table/table_background.png",
  cardFace: (_card: Card): string | undefined => undefined,
  avatar: (_id: string, displayName?: string): string | undefined => {
    const key = displayName?.trim().toLowerCase();
    return key ? avatarByName[key] : undefined;
  },
};
