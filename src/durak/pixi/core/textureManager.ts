import { Assets, Texture } from "pixi.js";
import type { DurakCard, DurakRank, DurakSuit } from "@/durak/rules";
import {
  getDurakCardFaceUrl,
  getDurakCardBackUrl,
  getDurakTableArtUrl,
  getDurakCardKey,
  RANK_NAMES,
} from "../assets/cardTextureMap";

const SUITS: readonly DurakSuit[] = ["clubs", "diamonds", "hearts", "spades"];
const RANKS: readonly DurakRank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];

export class DurakTextureManager {
  private textures = new Map<string, Texture>();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  async preloadAll(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const urlsToLoad: Array<{ key: string; url: string }> = [
        { key: "back", url: getDurakCardBackUrl() },
        { key: "table", url: getDurakTableArtUrl() },
      ];

      for (const suit of SUITS) {
        for (const rank of RANKS) {
          const card: DurakCard = { suit, rank };
          urlsToLoad.push({
            key: getDurakCardKey(card),
            url: getDurakCardFaceUrl(card),
          });
        }
      }

      // Load all textures concurrently
      await Promise.all(
        urlsToLoad.map(async ({ key, url }) => {
          try {
            const texture = await Assets.load<Texture>(url);
            this.textures.set(key, texture);
          } catch (err) {
            console.warn(`[DurakTextureManager] Failed to load ${url}, creating fallback`, err);
            this.textures.set(key, Texture.WHITE);
          }
        })
      );

      this.isLoaded = true;
    })();

    return this.loadPromise;
  }

  getCardFaceTexture(card: DurakCard): Texture {
    const key = getDurakCardKey(card);
    return this.textures.get(key) || Texture.WHITE;
  }

  getCardBackTexture(): Texture {
    return this.textures.get("back") || Texture.WHITE;
  }

  getTableTexture(): Texture {
    return this.textures.get("table") || Texture.WHITE;
  }

  destroy(): void {
    this.textures.clear();
    this.isLoaded = false;
    this.loadPromise = null;
  }
}
