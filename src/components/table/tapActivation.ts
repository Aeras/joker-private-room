import type { MouseEvent, PointerEvent } from "react";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";

/**
 * Activation that does not depend on the browser synthesising a `click`.
 *
 * Some mobile engines drop the synthetic click of the first tap that follows a
 * `touch-action: none` + pointer-capture drag (the Joker drag that opens the
 * chooser): pointerdown/pointerup arrive, click does not. Touch/pen therefore
 * activates on a pointerup that ends inside the element it started on; mouse,
 * keyboard and assistive activation keep using `click`. A synthetic click that
 * does follow a handled tap is ignored, so each tap activates exactly once.
 */
export const TAP_CLICK_SUPPRESS_MS = 700;

type Tracker = { pointerId: number | null; suppressClickUntil: number };

export function createTapTracker(): Tracker {
  return { pointerId: null, suppressClickUntil: 0 };
}

function inside(element: Element, x: number, y: number): boolean {
  const rect = element.getBoundingClientRect();
  // jsdom and some engines report empty rects for valid targets; trust the target then.
  if (rect.width === 0 && rect.height === 0) return true;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Swallow one browser-synthesised click that may still arrive after a tap was handled on pointerup. */
export function swallowNextSyntheticClick(ms = TAP_CLICK_SUPPRESS_MS): void {
  if (typeof document === "undefined") return;
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const stop = () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", swallow, true);
  };
  const timer = window.setTimeout(stop, ms);
  document.addEventListener("click", swallow, true);
}

export function tapActivationHandlers<T extends HTMLElement>(
  tracker: Tracker,
  activate: () => void,
  label: string,
  options: { isDisabled?: () => boolean; swallowFollowingClick?: boolean } = {},
) {
  const disabled = () => options.isDisabled?.() ?? false;
  return {
    onPointerDown: (event: PointerEvent<T>) => {
      recordTimingDiagnostic("joker_choice_input", {
        phase: "pointerdown",
        pointerType: event.pointerType,
        target: label,
      });
      if (event.pointerType === "mouse" || !event.isPrimary || disabled()) return;
      tracker.pointerId = event.pointerId;
    },
    onPointerCancel: (event: PointerEvent<T>) => {
      if (tracker.pointerId === event.pointerId) tracker.pointerId = null;
    },
    onPointerUp: (event: PointerEvent<T>) => {
      recordTimingDiagnostic("joker_choice_input", {
        phase: "pointerup",
        pointerType: event.pointerType,
        target: label,
      });
      if (tracker.pointerId !== event.pointerId) return;
      tracker.pointerId = null;
      if (disabled() || !inside(event.currentTarget, event.clientX, event.clientY)) return;
      tracker.suppressClickUntil = performance.now() + TAP_CLICK_SUPPRESS_MS;
      if (options.swallowFollowingClick) swallowNextSyntheticClick();
      recordTimingDiagnostic("joker_choice_activate", { via: "pointerup", target: label });
      activate();
    },
    onClick: (event: MouseEvent<T>) => {
      recordTimingDiagnostic("joker_choice_input", { phase: "click", target: label });
      if (performance.now() < tracker.suppressClickUntil) {
        tracker.suppressClickUntil = 0;
        event.preventDefault();
        return;
      }
      if (disabled()) return;
      recordTimingDiagnostic("joker_choice_activate", { via: "click", target: label });
      activate();
    },
  };
}
