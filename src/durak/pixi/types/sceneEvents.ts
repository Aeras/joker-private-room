import type { DurakCard } from "@/durak/rules";
import type { DurakPublicEvent } from "@/durak/engine";

export type DurakInputCallbacks = {
  onPlayCard: (card: DurakCard) => void;
  onDropCard: (card: DurakCard, targetPairIndex?: number) => void;
  onSelectTarget: (pairIndex: number | null) => void;
};

export type DurakSceneDiagnostics = {
  renderer: "webgl" | "webgpu" | "canvas" | "unknown";
  dpr: number;
  width: number;
  height: number;
  fps: number;
  activeSprites: number;
  activeAnimations: number;
};
