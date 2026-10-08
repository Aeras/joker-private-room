import { useLayoutEffect, useRef } from "react";

export const HAND_REFLOW_MS = 250;

function translationX(node: HTMLElement): number {
  const transform = getComputedStyle(node).transform;
  const values = transform
    .slice(transform.indexOf("(") + 1, -1)
    .split(",")
    .map(Number);
  return transform.startsWith("matrix3d(")
    ? (values[12] ?? 0)
    : transform.startsWith("matrix(")
      ? (values[4] ?? 0)
      : 0;
}

/** Animate layout displacement on wrappers, independently of the card's drag transform. */
export function useHandReflow(identity: string, enabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, number>());
  const previousIdentity = useRef<string | null>(null);
  const animations = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-hand-layout-card]"));
    const ids = new Set(nodes.map((node) => node.dataset["handLayoutCard"]!));
    for (const [id, animation] of animations.current) {
      if (!enabled || !ids.has(id)) {
        animation.cancel();
        animations.current.delete(id);
      }
    }
    const changed =
      enabled && previousIdentity.current !== null && previousIdentity.current !== identity;
    const next = new Map<string, number>();
    const origin = container.getBoundingClientRect().left;
    for (const node of nodes) {
      const id = node.dataset["handLayoutCard"]!;
      const animation = animations.current.get(id);
      const residual = animation ? translationX(node) : 0;
      const position = node.getBoundingClientRect().left - origin - residual;
      next.set(id, position);
      const old = previous.current.get(id);
      if (!changed || old == null) continue;
      animation?.cancel();
      animations.current.delete(id);
      const delta = old + residual - position;
      if (Math.abs(delta) < 0.5 || typeof node.animate !== "function") continue;
      const motion = node.animate(
        [{ transform: `translateX(${delta}px)` }, { transform: "translateX(0px)" }],
        { duration: HAND_REFLOW_MS, easing: "ease-out" },
      );
      animations.current.set(id, motion);
      motion.onfinish = () => {
        if (animations.current.get(id) === motion) {
          motion.cancel();
          animations.current.delete(id);
        }
      };
    }
    previous.current = enabled ? next : new Map();
    previousIdentity.current = enabled ? identity : null;
  });

  useLayoutEffect(
    () => () => {
      for (const animation of animations.current.values()) animation.cancel();
      animations.current.clear();
    },
    [],
  );
  return root;
}
