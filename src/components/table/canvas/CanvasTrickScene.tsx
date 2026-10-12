import { useLayoutEffect, useRef } from "react";
import type { SeatIndex } from "@/domain/dealing";
import type { PlayedCard } from "@/domain/engine";
import { cardLabel } from "@/domain/cards";
import { assets } from "@/assets/registry";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
import type { TableGeometry } from "../useTableGeometry";
import { canvasCardAssets } from "./assetCache";
import { CardCanvasEngine } from "./engine";
import { trickSpriteMotion, type TrickStage } from "./trickSceneMotion";
import type { CardSprite } from "./types";

export function CanvasTrickScene({
  cards,
  viewerSeat,
  geometry,
  stage,
  winnerSeat,
  settled,
  reducedMotion,
  paused,
  onComplete,
  onFailure,
}: {
  cards: PlayedCard[];
  viewerSeat: SeatIndex;
  geometry: TableGeometry;
  stage: TrickStage;
  winnerSeat: SeatIndex | null;
  settled: (play: PlayedCard) => boolean;
  reducedMotion: boolean;
  paused: boolean;
  onComplete: (play: PlayedCard, stage: TrickStage) => void;
  onFailure: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<CardCanvasEngine | null>(null);
  const owners = useRef(new Map<string, TrickStage>());
  const sprites = useRef(new Map<string, CardSprite>());
  const latest = useRef({ onComplete, onFailure, stage });
  latest.current = { onComplete, onFailure, stage };
  useLayoutEffect(() => {
    const element = canvas.current!;
    const ownedMotions = owners.current,
      ownedSprites = sprites.current;
    let cancelled = false,
      failed = false;
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      engine.current?.dispose();
      latest.current.onFailure();
    };
    const resize = () => {
      try {
        engine.current?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      } catch {
        fail();
      }
    };
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
    window.addEventListener("orientationchange", resize);
    element.addEventListener("contextlost", fail);
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
      ownedMotions.clear();
      ownedSprites.clear();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      element.removeEventListener("contextlost", fail);
    };
  }, []);
  useLayoutEffect(() => {
    const renderer = engine.current;
    if (!renderer) return;
    if (paused) renderer.suspend();
    else renderer.resume();
    const ids = new Set(cards.map((play) => `${play.seatIndex}:${play.card.id}`));
    for (const id of owners.current.keys())
      if (!ids.has(id)) {
        renderer.remove(id);
        owners.current.delete(id);
        sprites.current.delete(id);
      }
    for (const play of cards) {
      const id = `${play.seatIndex}:${play.card.id}`;
      const motion = trickSpriteMotion(
        play,
        viewerSeat,
        geometry,
        stage,
        winnerSeat,
        reducedMotion,
      );
      if (!owners.current.has(id)) {
        const image = canvasCardAssets.peek(assets.cardFace(play.card)!);
        const backImage = canvasCardAssets.peek(assets.cardBack);
        if (!image || !backImage) {
          latest.current.onFailure();
          return;
        }
        const sprite = {
          id,
          image,
          backImage,
          layer: 10,
          pose: stage === "landing" && !settled(play) ? motion.sample(0) : motion.resting,
        };
        sprites.current.set(id, sprite);
        renderer.set(sprite);
        recordTimingDiagnostic("remote_canvas_first_surface", { seat: play.seatIndex, stage, cardId: play.card.id });
      }
      const previous = owners.current.get(id);
      if (previous === stage) {
        // Hydration/foreground may re-anchor settled cards, never an active flight.
        if (stage === "landing" && settled(play))
          renderer.set({ ...sprites.current.get(id)!, pose: motion.resting });
        continue;
      }
      owners.current.set(id, stage);
      if (
        stage === "holding" ||
        (stage === "landing" && settled(play)) ||
        (stage === "stacking" && play.seatIndex === winnerSeat)
      )
        continue;
      renderer.animate(id, motion.duration, motion.sample, () => {
        if (latest.current.stage !== stage) return;
        recordTimingDiagnostic("canvas_trick_motion_complete", {
          cardId: play.card.id,
          stage,
          ...renderer.metrics(),
        });
        latest.current.onComplete(play, stage);
      });
    }
  }, [cards, viewerSeat, geometry, stage, winnerSeat, settled, reducedMotion, paused]);
  return (
    <>
      <canvas
        ref={canvas}
        data-renderer="canvas-trick"
        data-canvas-trick-stage={stage}
        data-canvas-trick-cards={cards.map((play) => `${play.seatIndex}:${play.card.id}`).join(",")}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-10"
        style={{ width: "100vw", height: "100dvh" }}
      />
      <span className="sr-only">
        {cards.map((play) => `${play.seatIndex + 1}: ${cardLabel(play.card)}`).join(". ")}
      </span>
    </>
  );
}
