import { useCallback, useLayoutEffect, useRef } from "react";
import { cardLabel } from "@/domain/cards";
import { playGameSound } from "@/lib/gameAudio";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
import type { LocalPlayPresentation } from "../localPlayPresentation";
import { CardCanvasEngine } from "./engine";
import type { LocalFlightInstruction } from "./projectionAdapter";
import type { SpritePose } from "./types";

export function CanvasLocalFlight({
  presentation,
  instruction,
  image,
  backImage,
  onLanded,
  onSettled,
  onFailure,
}: {
  presentation: LocalPlayPresentation;
  instruction: LocalFlightInstruction;
  image: HTMLImageElement;
  backImage?: HTMLImageElement;
  onLanded?: () => void;
  onSettled: () => void;
  onFailure: (pose: SpritePose | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<CardCanvasEngine | null>(null);
  const frozen = useRef({ instruction, image, backImage }).current;
  const latest = useRef({ presentation, onLanded, onSettled, onFailure });
  latest.current = { presentation, onLanded, onSettled, onFailure };
  const state = useRef({ landed: false, returning: false, returned: false, finished: false });
  const settle = useCallback(() => {
    const flags = state.current;
    if (flags.finished) return;
    const status = latest.current.presentation.status;
    if ((status === "accepted" && flags.landed) || (status === "rejected" && flags.returned)) {
      flags.finished = true;
      latest.current.onSettled();
    }
  }, []);
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let cancelled = false,
      failed = false;
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      const current = engine.current?.pose(frozen.instruction.id) ?? frozen.instruction.initial;
      engine.current?.dispose();
      recordTimingDiagnostic("canvas_flight_fallback", {
        cardId: latest.current.presentation.cardId,
      });
      latest.current.onFailure(current);
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
      const renderer = new CardCanvasEngine(element, context, fail);
      engine.current = renderer;
      resize();
      renderer.set({
        id: frozen.instruction.id,
        image: frozen.image,
        ...(frozen.backImage ? { backImage: frozen.backImage } : {}),
        pose: frozen.instruction.initial,
        layer: 40,
      });
      recordTimingDiagnostic("local_flight_launch", {
        cardId: latest.current.presentation.cardId,
        durationMs: frozen.instruction.duration,
        renderer: "canvas",
      });
      renderer.animate(
        frozen.instruction.id,
        frozen.instruction.duration,
        (time) => {
          const pose = frozen.instruction.sample(time);
          const zIndex = pose.layer === 0 ? "0" : "40";
          if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex;
          return pose;
        },
        () => {
          if (
            cancelled ||
            failed ||
            state.current.returning ||
            latest.current.presentation.status === "rejected"
          )
            return;
          state.current.landed = true;
          element.dataset["canvasPhase"] = "landed";
          const token = latest.current.presentation;
          const metrics = renderer.metrics();
          recordTimingDiagnostic("local_flight_landed", {
            cardId: token.cardId,
            durationMs: frozen.instruction.duration,
            renderer: "canvas",
            canvasFrames: metrics.frames,
            canvasMaxGapMs: metrics.maxFrameGapMs,
            canvasPaintMs: metrics.paintMs,
          });
          latest.current.onLanded?.();
          playGameSound(
            "play",
            `${token.gameId}:${token.dealNumber}:local-flight:${token.cardId}:${token.sourceStateVersion}`,
          );
          settle();
        },
      );
      if (document.visibilityState === "hidden") suspend();
    } catch {
      fail();
    }
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    window.addEventListener("blur", suspend);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    element.addEventListener("contextlost", fail);
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.removeEventListener("blur", suspend);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visibility);
      element.removeEventListener("contextlost", fail);
    };
  }, [frozen, settle]);
  useLayoutEffect(() => {
    if (presentation.status !== "rejected" || state.current.returning) {
      settle();
      return;
    }
    const renderer = engine.current,
      current = renderer?.pose(instruction.id);
    if (!renderer || !current) return;
    state.current.returning = true;
    if (canvas.current) canvas.current.style.zIndex = "40";
    if (canvas.current) canvas.current.dataset["canvasPhase"] = "returning";
    const end = frozen.instruction.origin;
    renderer.animate(
      instruction.id,
      instruction.duration,
      (time) => {
        const t = 1 - (1 - time) ** 2;
        return {
          x: current.x + (end.x - current.x) * t,
          y: current.y + (end.y - current.y) * t,
          width: current.width + (end.width - current.width) * t,
          height: current.height + (end.height - current.height) * t,
          rotation: current.rotation + (end.rotation - current.rotation) * t,
          opacity: 1,
          flip: current.flip * (1 - t),
          backBlend: (current.backBlend ?? 0) * (1 - t),
        };
      },
      () => {
        state.current.returned = true;
        recordTimingDiagnostic("local_flight_returned", {
          cardId: presentation.cardId,
          renderer: "canvas",
        });
        settle();
      },
    );
  }, [
    presentation.status,
    presentation.cardId,
    frozen,
    instruction.id,
    instruction.duration,
    settle,
  ]);
  return (
    <>
      <canvas
        ref={canvas}
        data-local-flight-card={presentation.cardId}
        data-local-flight-status={presentation.status}
        data-renderer="canvas"
        data-canvas-phase="flying"
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-40"
        style={{ width: "100vw", height: "100dvh" }}
      />
      <span className="sr-only">{cardLabel(presentation.card)}</span>
    </>
  );
}
