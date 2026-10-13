import { preloadCardAsset, resolvedCardArtwork } from "@/assets/cardPreload";
/** Separate small bitmap pool, preserving the proven DOM readiness/fallback cache. */
export class CanvasCardAssets {
  private entries = new Map<
    string,
    {
      image: HTMLImageElement | null;
      ready: boolean;
      promise: Promise<HTMLImageElement | null>;
      cancel: (() => void) | undefined;
      retained: number;
    }
  >();
  constructor(private limit = 16) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 32)
      throw new Error("INVALID_BITMAP_BUDGET");
  }
  peek(url: string) {
    const entry = this.entries.get(url);
    return entry?.ready ? entry.image : null;
  }
  /** Keep artwork used by a mounted, authorized scene in the bounded pool. */
  retain(url: string) {
    const entry = this.entries.get(url);
    if (!entry) return () => {};
    entry.retained++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.retained = Math.max(0, entry.retained - 1);
    };
  }
  warm(url: string): Promise<HTMLImageElement | null> {
    const old = this.entries.get(url);
    if (old) {
      this.entries.delete(url);
      this.entries.set(url, old);
      return old.promise;
    }
    if (this.entries.size >= this.limit && ![...this.entries.values()].some((entry) => entry.retained === 0))
      return Promise.resolve(null);
    if (typeof Image === "undefined") return Promise.resolve(null);
    const entry = {
      image: null as HTMLImageElement | null,
      ready: false,
      promise: Promise.resolve(null) as Promise<HTMLImageElement | null>,
      cancel: undefined as (() => void) | undefined,
      retained: 0,
    };
    this.entries.set(url, entry);
    while (this.entries.size > this.limit) {
      const key = [...this.entries].find(([, candidate]) => candidate.retained === 0)?.[0];
      if (!key) break;
      this.entries.get(key)?.cancel?.();
      this.entries.delete(key);
    }
    entry.promise = (async () => {
      if (!(await preloadCardAsset(url)) || this.entries.get(url) !== entry) return null;
      const image = new Image();
      image.decoding = "async";
      entry.image = image;
      const ready = await new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          image.onload = null;
          image.onerror = null;
          entry.cancel = undefined;
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), 3000);
        entry.cancel = () => finish(false);
        image.onload = () => {
          const renderable = () => image.complete && image.naturalWidth > 0;
          try {
            const decode = image.decode?.();
            if (decode)
              void decode.then(
                () => finish(renderable()),
                () => finish(renderable()),
              );
            else finish(renderable());
          } catch {
            finish(renderable());
          }
        };
        image.onerror = () => finish(false);
        image.src = resolvedCardArtwork(url);
        if (image.complete && image.naturalWidth > 0) image.onload(new Event("load"));
      });
      if (!ready || this.entries.get(url) !== entry) return null;
      entry.ready = true;
      return image;
    })().catch(() => null);
    return entry.promise;
  }
  clear() {
    for (const entry of this.entries.values()) entry.cancel?.();
    this.entries.clear();
  }
}
export const canvasCardAssets = new CanvasCardAssets();
export function canvasFlightAvailable() {
  return (
    import.meta.env["VITE_JOKER_FLIGHT_RENDERER"] !== "dom" &&
    typeof CanvasRenderingContext2D !== "undefined"
  );
}
