/** Visual asset registry for the private Joker room. */
import type { Card, Rank } from "@/domain/cards";

const avatarByName: Record<string, string> = {
  giobis: "/avatars/giobis.png",
  nikos: "/avatars/giobis.png",
  "νίκος": "/avatars/giobis.png",
  "ζωάλο πουτς": "/avatars/giobis.png",
  mixalis: "/avatars/mixalis.png",
  "μιχάλης": "/avatars/mixalis.png",
  "τζαμανάς δικώνετε": "/avatars/mixalis.png",
  git: "/avatars/git.png",
  gita: "/avatars/git.png",
  "γίτα": "/avatars/git.png",
  panagiotis: "/avatars/git.png",
  "παναγιώτης": "/avatars/git.png",
  "θεία ταμάρα": "/avatars/bots/tamara.png",
  "γκρίσα ο ύποπτος": "/avatars/bots/grisa.png",
  "σερζ ο μαθηματικός": "/avatars/bots/serz.png",
  "βαλέρια η επικίνδυνη": "/avatars/bots/valeria.png",
  "μπάμπης ο χαλαρός": "/avatars/bots/babis.png",
  "καπετάνιος": "/avatars/bots/kapetanios.png",
};

const rankAssetName: Record<Rank, string> = {
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
  A: "ace",
};

function canonicalCardFace(card: Card): string | undefined {
  if (card.kind === "joker") {
    if (card.id === "joker-1") return "/cards/joker_red.png";
    if (card.id === "joker-2") return "/cards/joker_black.png";
    return undefined;
  }

  return `/cards/${card.suit}_${rankAssetName[card.rank]}.png`;
}

export const assets = {
  cardBack: "/cards/card_back.png",
  tableArt: "/table/table_background.png",
  cardFace: canonicalCardFace,
  avatar: (_id: string, displayName?: string): string | undefined => {
    const key = displayName?.trim().toLowerCase();
    return key ? avatarByName[key] : undefined;
  },
};
