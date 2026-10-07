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

const RUNTIME_CARD_ROOT = "/cards/runtime-png";

function canonicalCardFace(card: Card): string | undefined {
  if (card.kind === "joker") {
    if (card.id === "joker-1") return `${RUNTIME_CARD_ROOT}/faces/joker_red.png`;
    if (card.id === "joker-2") return `${RUNTIME_CARD_ROOT}/faces/joker_black.png`;
    return undefined;
  }

  return `${RUNTIME_CARD_ROOT}/faces/${card.suit}_${rankAssetName[card.rank]}.png`;
}

const tableAvatarNames = new Set(["archimandritis", "giobis", "giorgos_nousios", "git", "ka_monika", "mixalis", "mounara", "theia_tamara", "thomoulis"]);
function tableAvatar(url: string | undefined): string | undefined {
  if (!url) return url;
  let pathname = url;
  if (!url.startsWith("/") || url.startsWith("//")) {
    if (typeof window === "undefined") return url;
    try { const parsed = new URL(url, window.location.origin); if (parsed.origin !== window.location.origin) return url; pathname = parsed.pathname; } catch { return url; }
  }
  const match = /^\/avatars\/([a-z_]+)\.png$/.exec(pathname);
  return match && tableAvatarNames.has(match[1]!) ? "/avatars/table/" + match[1] + ".webp" : url;
}
function cardArtwork(url: string): string {
  return url;
}

export const assets = {
  cardBack: `${RUNTIME_CARD_ROOT}/backs/blue_back.png`,
  tableArt: "/table/optimized/table_background.webp",
  cardArtwork,
  tableAvatar,
  cardFace: canonicalCardFace,
  avatar: (_id: string, displayName?: string): string | undefined => {
    const key = displayName?.trim().toLowerCase();
    return key ? avatarByName[key] : undefined;
  },
};
