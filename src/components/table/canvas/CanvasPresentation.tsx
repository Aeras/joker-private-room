import { useLayoutEffect, useRef } from "react";
import { canvasCardAssets } from "./assetCache";
import { CardCanvasEngine } from "./engine";
import type { SpritePose } from "./types";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";

export interface PresentationSprite {
  id: string;
  url: string;
  backUrl?: string;
  layer: number;
  phase: string;
  duration: number;
  sample: (progress: number) => SpritePose;
  onComplete?: () => void;
}
/** One engine for a presentation ritual. Existing authority/barriers stay outside. */
export function CanvasPresentation({
  sprites,
  onFailure,
  name,
}: {
  sprites: readonly PresentationSprite[];
  onFailure: () => void;
  name: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<CardCanvasEngine | null>(null);
  const phases = useRef(new Map<string, string>()),
    latest = useRef(onFailure);
  latest.current = onFailure;
  useLayoutEffect(() => {
    const element = canvas.current!,
      owned = phases.current;
    let cancelled = false,
      failed = false;
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      recordTimingDiagnostic("canvas_presentation_fallback", { presentation: name });
      engine.current?.dispose();
      latest.current();
    };
    const resize = () => {
      try {
        engine.current?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      } catch {
        fail();
      }
    };
    const suspend = () => engine.current?.suspend();
    const resume = () => {
      if (document.visibilityState !== "hidden") {
        resize();
        engine.current?.resume();
      }
    };
    const visibility = () => (document.visibilityState === "hidden" ? suspend() : resume());
    try {
      const context = element.getContext("2d");
      if (!context) {
        fail();
        return;
      }
      engine.current = new CardCanvasEngine(element, context, fail);
      resize();
    } catch {
      fail();
    }
    window.addEventListener("resize", resize);
    window.addEventListener("blur", suspend);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    element.addEventListener("contextlost", fail);
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
      owned.clear();
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", suspend);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visibility);
      element.removeEventListener("contextlost", fail);
    };
  }, [name]);
  useLayoutEffect(() => {
    const renderer = engine.current;
    if (!renderer) return;
    renderer.batch(() => {
    const ids = new Set(sprites.map((s) => s.id));
    for (const id of phases.current.keys())
      if (!ids.has(id)) {
        renderer.remove(id);
        phases.current.delete(id);
      }
    try {
      for (const sprite of sprites) {
        if (phases.current.get(sprite.id) === sprite.phase) continue;
        const image = canvasCardAssets.peek(sprite.url),
          backImage = sprite.backUrl ? canvasCardAssets.peek(sprite.backUrl) : null;
        if (!image || (sprite.backUrl && !backImage)) {
          latest.current();
          return;
        }
        renderer.cancelMotion(sprite.id);
        renderer.set({
          id: sprite.id,
          image,
          ...(backImage ? { backImage } : {}),
          layer: sprite.layer,
          pose: sprite.sample(0),
        });
        phases.current.set(sprite.id, sprite.phase);
        if (sprite.duration > 0)
          renderer.animate(sprite.id, sprite.duration, sprite.sample, () => {
            recordTimingDiagnostic("canvas_presentation_motion_complete", {
              presentation: name,
              spriteId: sprite.id,
              ...renderer.metrics(),
            });
            sprite.onComplete?.();
          });
      }
    } catch {
      latest.current();
    }
    });
  }, [sprites, name]);
  return (
    <canvas
      ref={canvas}
      data-canvas-presentation={name}
      data-canvas-sprite-count={sprites.length}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0"
      style={{ width: "100vw", height: "100dvh" }}
    />
  );
}
