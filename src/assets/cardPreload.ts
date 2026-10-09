import { assets } from "./registry";
const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
const RANK_ASSET_NAMES = ["6", "7", "8", "9", "10", "jack", "queen", "king", "ace"] as const;
const RUNTIME_FACE_ROOT = "/cards/runtime-png/faces";

export const CARD_ASSET_URLS = [
  ...SUITS.flatMap((suit) => RANK_ASSET_NAMES.map((rank) => `${RUNTIME_FACE_ROOT}/${suit}_${rank}.png`)),
  `${RUNTIME_FACE_ROOT}/joker_red.png`,
  `${RUNTIME_FACE_ROOT}/joker_black.png`,
  assets.cardBack,
] as const;

const readyAssets = new Set<string>();
const decodedAssets = new Set<string>();
const failedAssets = new Set<string>();
const failedAt = new Map<string, number>();
const retryableAssets = new Set<string>();
const decodedUrls = new Map<string, string>();
const originalPreferred = new Set<string>();
export function resolvedCardArtwork(url: string): string { return decodedUrls.get(url) ?? (originalPreferred.has(url) ? url : assets.cardArtwork(url)); }
const pendingAssets = new Map<string, Promise<boolean>>();
let fullDeckPreload: Promise<void> | null = null;
export const CARD_LOAD_TIMEOUT_MS = 12_000;
export const CARD_DECODE_TIMEOUT_MS = 2_500;
export const CARD_RETRY_COOLDOWN_MS = 5_000;
export type CardAssetStatus = "cold" | "loading" | "decoded-ready" | "renderable-ready" | "retryable" | "failed";
export function cardAssetStatus(url: string): CardAssetStatus {
  return readyAssets.has(url) ? decodedAssets.has(url) ? "decoded-ready" : "renderable-ready" : failedAssets.has(url) ? "failed" : retryableAssets.has(url) ? "retryable" : pendingAssets.has(url) ? "loading" : "cold";
}
export function isCardAssetReady(url: string | undefined): boolean { return Boolean(url && readyAssets.has(url)); }
export function hasCardAssetFailed(url: string | undefined): boolean { return Boolean(url && failedAssets.has(url)); }
/** A DOM image failure invalidates stale cache readiness and tries the original. */
export function recoverCardAsset(url: string): Promise<boolean> {
  const pending = pendingAssets.get(url);
  if (pending) return pending;
  readyAssets.delete(url); decodedAssets.delete(url); failedAssets.delete(url);
  failedAt.delete(url); decodedUrls.delete(url); originalPreferred.add(url);
  return preloadCardAsset(url);
}
export function preloadCardAsset(url: string): Promise<boolean> {
  if (readyAssets.has(url)) return Promise.resolve(true);
  if (failedAssets.has(url)) {
    if (Date.now() - (failedAt.get(url) ?? 0) < CARD_RETRY_COOLDOWN_MS) return Promise.resolve(false);
    failedAssets.delete(url); failedAt.delete(url);
  }
  const pending = pendingAssets.get(url); if (pending) return pending;
  if (typeof Image === "undefined") return Promise.resolve(false);
  // Publish the coalesced promise before an already-cached image can complete.
  let finish!: (ok: boolean) => void;
  const request = new Promise<boolean>(resolve => { finish = resolve; });
  pendingAssets.set(url, request);
  const attempt = (number: number) => {
    retryableAssets.delete(url);
    const image = new Image(); image.decoding = "async";
    const artwork = number === 1 && !originalPreferred.has(url) ? assets.cardArtwork(url) : url;
    let completed = false, decoding = false;
    let decodeTimer: number | undefined;
    const timeout = window.setTimeout(() => settle(false), CARD_LOAD_TIMEOUT_MS);
    const settle = (ok: boolean, decoded = false) => {
      if (completed) return; completed = true; window.clearTimeout(timeout); image.onload = null; image.onerror = null;
      if (decodeTimer != null) window.clearTimeout(decodeTimer);
      if (!ok && number < 2) { retryableAssets.add(url); window.setTimeout(() => attempt(number + 1), 250); return; }
      retryableAssets.delete(url); pendingAssets.delete(url);
      if (ok) { readyAssets.add(url); if (decoded) decodedAssets.add(url); decodedUrls.set(url, artwork); }
      else { failedAssets.add(url); failedAt.set(url, Date.now()); }
      finish(ok);
    };
    const loaded = () => {
      if (decoding || completed) return; decoding = true;
      // decode() can reject on low-memory browsers even after a valid load.
      // Do not turn a renderable PNG into a session-long semantic placeholder.
      const renderable = () => image.complete && image.naturalWidth > 0;
      decodeTimer = window.setTimeout(() => settle(renderable()), CARD_DECODE_TIMEOUT_MS);
      try {
        const decode = image.decode?.();
        if (decode) void decode.then(() => settle(true, true), () => settle(renderable()));
        else settle(renderable());
      } catch { settle(renderable()); }
    };
    image.onload = loaded; image.onerror = () => settle(false); image.src = artwork;
    if (image.complete && image.naturalWidth > 0) loaded();
  };
  attempt(1); return request;
}

/** Warm the browser memory/HTTP cache once, before gameplay needs individual faces. */
export function preloadCardAssets(): Promise<void> {
  if (fullDeckPreload) return fullDeckPreload;
  // Two background workers rather than 39 concurrent transfers/decodes.
  // Visible critical cards call preloadCardAsset directly and never wait here.
  let index = 0;
  const worker = async () => {
    while (index < CARD_ASSET_URLS.length) {
      const url = CARD_ASSET_URLS[index++]!;
      await preloadCardAsset(url);
    }
  };
  fullDeckPreload = Promise.all([worker(), worker()]).then(() => undefined);
  return fullDeckPreload;
}

// PlayingCard imports this module as part of the gameplay bundle, so start warming
// all 39 canonical gameplay assets before the first individual card actually needs them.
if (typeof window !== "undefined") {
  window.setTimeout(() => void preloadCardAssets(), 50);
}
