const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
const RANK_ASSET_NAMES = ["6", "7", "8", "9", "10", "jack", "queen", "king", "ace"] as const;

export const CARD_ASSET_URLS = [
  ...SUITS.flatMap((suit) => RANK_ASSET_NAMES.map((rank) => `/cards/${suit}_${rank}.png`)),
  "/cards/joker_red.png",
  "/cards/joker_black.png",
  "/cards/card_back.png",
] as const;

const readyAssets = new Set<string>();
const failedAssets = new Set<string>();
const pendingAssets = new Map<string, Promise<boolean>>();
let fullDeckPreload: Promise<void> | null = null;

export function isCardAssetReady(url: string | undefined): boolean {
  return Boolean(url && readyAssets.has(url));
}

export function hasCardAssetFailed(url: string | undefined): boolean {
  return Boolean(url && failedAssets.has(url));
}

export function preloadCardAsset(url: string): Promise<boolean> {
  if (readyAssets.has(url)) return Promise.resolve(true);
  if (failedAssets.has(url)) return Promise.resolve(false);
  const pending = pendingAssets.get(url);
  if (pending) return pending;

  if (typeof Image === "undefined") return Promise.resolve(false);

  const request = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";

    const succeed = () => {
      readyAssets.add(url);
      failedAssets.delete(url);
      pendingAssets.delete(url);
      resolve(true);
    };
    const fail = () => {
      failedAssets.add(url);
      pendingAssets.delete(url);
      resolve(false);
    };

    image.onload = () => {
      const decode = image.decode?.();
      if (decode && typeof decode.then === "function") {
        void decode.then(succeed).catch(succeed);
      } else {
        succeed();
      }
    };
    image.onerror = fail;
    image.src = url;

    if (image.complete && image.naturalWidth > 0) succeed();
  });

  pendingAssets.set(url, request);
  return request;
}

/** Warm the browser memory/HTTP cache once, before gameplay needs individual faces. */
export function preloadCardAssets(): Promise<void> {
  if (fullDeckPreload) return fullDeckPreload;
  fullDeckPreload = Promise.all(CARD_ASSET_URLS.map((url) => preloadCardAsset(url))).then(() => undefined);
  return fullDeckPreload;
}
