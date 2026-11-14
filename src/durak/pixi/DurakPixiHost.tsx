import { useEffect, useRef } from "react";
import { DurakPixiRuntime } from "./DurakPixiRuntime";
import type { DurakRenderState } from "./types/renderState";
import type { DurakCard } from "@/durak/rules";

export type DurakPixiHostProps = {
  renderState: DurakRenderState;
  onPlayCard: (card: DurakCard) => void;
  onDropCard: (card: DurakCard, targetPairIndex?: number) => void;
  onSelectTarget: (pairIndex: number | null) => void;
  className?: string;
};

export function DurakPixiHost({
  renderState,
  onPlayCard,
  onDropCard,
  onSelectTarget,
  className = "relative w-full h-full overflow-hidden select-none",
}: DurakPixiHostProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<DurakPixiRuntime | null>(null);

  // Initialize runtime on mount
  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window === "undefined") return;

    const runtime = new DurakPixiRuntime({
      onPlayCard: (card) => onPlayCard(card),
      onDropCard: (card, pairIdx) => onDropCard(card, pairIdx),
      onSelectTarget: (pairIdx) => onSelectTarget(pairIdx),
    });

    runtimeRef.current = runtime;
    runtime.init(el).catch((err) => {
      console.error("[DurakPixiHost] Runtime init failed", err);
    });

    return () => {
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, []);

  // Forward state updates to Pixi runtime
  useEffect(() => {
    if (runtimeRef.current) {
      runtimeRef.current.updateState(renderState);
    }
  }, [renderState]);

  return (
    <div
      ref={mountRef}
      className={className}
      data-durak-pixi-host
      style={{ touchAction: "none" }}
    />
  );
}
