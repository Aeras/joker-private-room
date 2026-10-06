import { assets } from "./registry";
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
const retryableAssets = new Set<string>();
const decodedUrls = new Map<string, string>();
export function resolvedCardArtwork(url: string): string { return decodedUrls.get(url) ?? assets.cardArtwork(url); }
const pendingAssets = new Map<string, Promise<boolean>>();
let fullDeckPreload: Promise<void> | null = null;
export type CardAssetStatus = "cold" | "loading" | "decoded-ready" | "retryable" | "failed";
export function cardAssetStatus(url: string): CardAssetStatus {
  return readyAssets.has(url) ? "decoded-ready" : failedAssets.has(url) ? "failed" : retryableAssets.has(url) ? "retryable" : pendingAssets.has(url) ? "loading" : "cold";
}
export function isCardAssetReady(url: string | undefined): boolean { return Boolean(url && readyAssets.has(url)); }
export function hasCardAssetFailed(url: string | undefined): boolean { return Boolean(url && failedAssets.has(url)); }
export function preloadCardAsset(url: string): Promise<boolean> {
  if (readyAssets.has(url)) return Promise.resolve(true);
  if (failedAssets.has(url)) return Promise.resolve(false);
  const pending = pendingAssets.get(url); if (pending) return pending;
  if (typeof Image === "undefined") return Promise.resolve(false);
  // Publish the coalesced promise before an already-cached image can complete.
  let finish!: (ok: boolean) => void;
  const request = new Promise<boolean>(resolve => { finish = resolve; });
  pendingAssets.set(url, request);
  const attempt = (number: number) => {
    retryableAssets.delete(url);
    const image = new Image(); image.decoding = "async";
    const artwork = number === 1 ? assets.cardArtwork(url) : url;
    let completed = false, decoding = false;
    const timeout = window.setTimeout(() => settle(false), 2500);
    const settle = (ok: boolean) => {
      if (completed) return; completed = true; window.clearTimeout(timeout); image.onload = null; image.onerror = null;
      if (!ok && number < 2) { retryableAssets.add(url); window.setTimeout(() => attempt(number + 1), 250); return; }
      retryableAssets.delete(url); pendingAssets.delete(url);
      if (ok) { readyAssets.add(url); decodedUrls.set(url, artwork); } else failedAssets.add(url);
      finish(ok);
    };
    const loaded = () => {
      if (decoding || completed) return; decoding = true;
      try { const decode = image.decode?.(); if (decode) void decode.then(() => settle(true), () => settle(false)); else settle(true); } catch { settle(false); }
    };
    image.onload = loaded; image.onerror = () => settle(false); image.src = artwork;
    if (image.complete && image.naturalWidth > 0) loaded();
  };
  attempt(1); return request;
}

/** Warm the browser memory/HTTP cache once, before gameplay needs individual faces. */
export function preloadCardAssets(): Promise<void> {
  if (fullDeckPreload) return fullDeckPreload;
  fullDeckPreload = Promise.all(CARD_ASSET_URLS.map((url) => preloadCardAsset(url))).then(() => undefined);
  return fullDeckPreload;
}

// PlayingCard imports this module as part of the gameplay bundle, so start warming
// all 39 canonical assets before the first individual card actually needs them.
if (typeof window !== "undefined") {
  void preloadCardAssets();
}
