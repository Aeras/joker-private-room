import { useEffect, useState } from "react";
import { cardAssetStatus, preloadCardAsset } from "@/assets/cardPreload";

/** A small immediate set only. Terminal failure uses the semantic card fallback. */
export function useCriticalCardArtwork(urls: readonly (string | undefined)[]): boolean {
  const key = JSON.stringify([...new Set(urls.filter((url): url is string => Boolean(url)))].sort());
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const settled = (JSON.parse(key) as string[]).every(url => ["decoded-ready", "renderable-ready", "failed"].includes(cardAssetStatus(url)));
  useEffect(() => {
    let cancelled = false;
    void Promise.all((JSON.parse(key) as string[]).map(preloadCardAsset)).then(() => { if (!cancelled) setCompletedKey(key); });
    return () => { cancelled = true; };
  }, [key]);
  return settled || completedKey === key;
}
