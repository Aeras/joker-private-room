import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { DESKTOP_TABLE_QUERY, desktopTableScale } from "./desktopTableSizing";

export type VisualSeat = 0 | 1 | 2 | 3;

export interface Point {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Release bounds plus the untransformed surface dimensions and drag angle. */
export interface CardReleaseRect extends RectLike {
  cardWidth?: number;
  cardHeight?: number;
  rotation?: number;
}

export interface TableGeometry {
  epoch: number;
  feltRect: RectLike;
  usableBounds: RectLike;
  usableCenter: Point;
  dealCenter: Point;
  seatOrigins: Record<VisualSeat, Point>;
  dealTargets: Record<VisualSeat, Point>;
  trickSlots: Record<VisualSeat, Point>;
  localHandCenter: Point;
  // Center reaches the visible bottom edge; half the back remains visible until fade.
  localDealExit?: Point;
  dealExitTargets?: Record<VisualSeat, Point>;
  localHandBounds?: RectLike;
  trickCardSize: { width: number; height: number };
}

interface GeometryInput {
  feltRect: RectLike;
  topSeatRect?: RectLike | null | undefined;
  leftSeatRect?: RectLike | null | undefined;
  rightSeatRect?: RectLike | null | undefined;
  localSeatRect?: RectLike | null | undefined;
  topHandRect?: RectLike | null | undefined;
  leftHandRect?: RectLike | null | undefined;
  rightHandRect?: RectLike | null | undefined;
  viewportWidth: number;
  viewportHeight: number;
  desktopPointer?: boolean;
}

const GAP = 12;
const DEAL_RADIUS_X_VIEWPORT = 0.26;
const DEAL_RADIUS_Y_VIEWPORT = 0.22;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function centerOf(rect: RectLike, felt: RectLike): Point {
  return {
    x: rect.left - felt.left + rect.width / 2,
    y: rect.top - felt.top + rect.height / 2,
  };
}

function fallbackSeatOrigins(width: number, height: number): Record<VisualSeat, Point> {
  return {
    0: { x: width / 2, y: height + 48 },
    1: { x: 0, y: height / 2 },
    2: { x: width / 2, y: 0 },
    3: { x: width, y: height / 2 },
  };
}

export function computeTableGeometry(input: GeometryInput): Omit<TableGeometry, "epoch"> {
  const { feltRect } = input;
  const width = Math.max(1, feltRect.width);
  const height = Math.max(1, feltRect.height);
  const fallback = fallbackSeatOrigins(width, height);

  const topInset = input.topSeatRect
    ? clamp(input.topSeatRect.bottom - feltRect.top + GAP, 0, height * 0.38)
    : 0;
  const leftInset = input.leftSeatRect
    ? clamp(input.leftSeatRect.right - feltRect.left + GAP, 0, width * 0.3)
    : 0;
  const rightEdge = input.rightSeatRect
    ? clamp(input.rightSeatRect.left - feltRect.left - GAP, width * 0.7, width)
    : width;
  const localTop = input.localSeatRect ? input.localSeatRect.top - feltRect.top - GAP : height;
  const bottomEdge = clamp(localTop, height * 0.62, height);

  const usableWidth = Math.max(1, rightEdge - leftInset);
  const usableHeight = Math.max(1, bottomEdge - topInset);
  const usableBounds: RectLike = {
    left: leftInset,
    top: topInset,
    right: rightEdge,
    bottom: bottomEdge,
    width: usableWidth,
    height: usableHeight,
  };
  const usableCenter = {
    x: usableBounds.left + usableBounds.width / 2,
    y: usableBounds.top + usableBounds.height / 2,
  };

  // Keep the compact trick within short landscape heights as well as its width.
  const cardWidth = Math.min(
    clamp(input.viewportWidth * 0.10625, 70, 135) *
      desktopTableScale(input.viewportWidth, input.viewportHeight, input.desktopPointer ?? false),
    Math.max(36, usableHeight / 2.55),
  ) * 0.95;
  const cardHeight = (cardWidth * 7) / 5;
  const horizontalOffset = cardWidth * 0.62;
  const verticalOffset = cardHeight * 0.42;

  const seatOrigins: Record<VisualSeat, Point> = {
    0: input.localSeatRect ? centerOf(input.localSeatRect, feltRect) : fallback[0],
    1: input.leftHandRect ? centerOf(input.leftHandRect, feltRect) : input.leftSeatRect ? centerOf(input.leftSeatRect, feltRect) : fallback[1],
    2: input.topHandRect ? centerOf(input.topHandRect, feltRect) : input.topSeatRect ? centerOf(input.topSeatRect, feltRect) : fallback[2],
    3: input.rightHandRect ? centerOf(input.rightHandRect, feltRect) : input.rightSeatRect ? centerOf(input.rightSeatRect, feltRect) : fallback[3],
  };

  // Dealing is positioned against the visible table viewport rather than the narrower
  // felt interaction container (which intentionally stops above the local hand/footer).
  // Convert those viewport-space cardinal points back into felt-local coordinates so
  // both the felt-mounted dealer ritual and the root-mounted normal deal share them.
  const viewportCenter = {
    x: input.viewportWidth / 2,
    y: input.viewportHeight / 2,
  };
  const toFeltLocal = (point: Point): Point => ({
    x: point.x - feltRect.left,
    y: point.y - feltRect.top,
  });
  const dealCenter = toFeltLocal(viewportCenter);
  const dealRadiusX = input.viewportWidth * DEAL_RADIUS_X_VIEWPORT;
  const dealRadiusY = input.viewportHeight * DEAL_RADIUS_Y_VIEWPORT;
  const dealTargets: Record<VisualSeat, Point> = {
    0: toFeltLocal({ x: viewportCenter.x, y: viewportCenter.y + dealRadiusY }),
    1: toFeltLocal({ x: viewportCenter.x - dealRadiusX, y: viewportCenter.y }),
    2: toFeltLocal({ x: viewportCenter.x, y: viewportCenter.y - dealRadiusY }),
    3: toFeltLocal({ x: viewportCenter.x + dealRadiusX, y: viewportCenter.y }),
  };
  // The local seat occupies the lower left; reserve a measured lane beside it.
  // Bounds use felt-local coordinates, just like the other presentation anchors.
  const handLeft = input.localSeatRect
    ? clamp(input.localSeatRect.right - feltRect.left + GAP, 0, width * 0.4)
    : 0;
  const localHandBounds: RectLike = {
    left: handLeft,
    right: width - handLeft,
    top: height,
    bottom: height,
    width: Math.max(1, width - 2 * handLeft),
    height: 0,
  };

  return {
    feltRect,
    usableBounds,
    usableCenter,
    dealCenter,
    seatOrigins,
    dealTargets,
    trickSlots: {
      0: { x: usableCenter.x, y: usableCenter.y + verticalOffset },
      1: { x: usableCenter.x - horizontalOffset, y: usableCenter.y },
      2: { x: usableCenter.x, y: usableCenter.y - verticalOffset },
      3: { x: usableCenter.x + horizontalOffset, y: usableCenter.y },
    },
    localHandCenter: { x: handLeft + localHandBounds.width / 2, y: height },
    localHandBounds,
    localDealExit: { x: dealTargets[0].x, y: input.viewportHeight - feltRect.top },
    dealExitTargets: {
      0: { x: dealTargets[0].x, y: input.viewportHeight - feltRect.top },
      1: { x: -feltRect.left, y: dealTargets[1].y },
      2: { x: dealTargets[2].x, y: -feltRect.top },
      3: { x: input.viewportWidth - feltRect.left, y: dealTargets[3].y },
    },
    trickCardSize: { width: cardWidth, height: cardHeight },
  };
}

function geometrySignature(value: Omit<TableGeometry, "epoch">): string {
  const p = (number: number) => Math.round(number * 2) / 2;
  return [
    p(value.feltRect.left),
    p(value.feltRect.top),
    p(value.feltRect.width),
    p(value.feltRect.height),
    p(value.usableBounds.left),
    p(value.usableBounds.top),
    p(value.usableBounds.right),
    p(value.usableBounds.bottom),
    p(value.dealCenter.x),
    p(value.dealCenter.y),
    p(value.localHandBounds?.left ?? 0),
    p(value.localHandBounds?.right ?? 0),
    p(value.localDealExit?.y ?? 0),
    p(value.dealCenter.x),
    p(value.trickCardSize.width),
    ...([0, 1, 2, 3] as VisualSeat[]).flatMap((seat) => [
      p(value.seatOrigins[seat].x),
      p(value.seatOrigins[seat].y),
      p(value.dealTargets[seat].x),
      p(value.dealTargets[seat].y),
    ]),
  ].join(":");
}

export function useTableGeometry(layoutKey?: string): {
  feltRef: RefObject<HTMLDivElement | null>;
  topSeatRef: RefObject<HTMLDivElement | null>;
  leftSeatRef: RefObject<HTMLDivElement | null>;
  rightSeatRef: RefObject<HTMLDivElement | null>;
  localSeatRef: RefObject<HTMLDivElement | null>;
  geometry: TableGeometry | null;
} {
  const feltRef = useRef<HTMLDivElement>(null);
  const topSeatRef = useRef<HTMLDivElement>(null);
  const leftSeatRef = useRef<HTMLDivElement>(null);
  const rightSeatRef = useRef<HTMLDivElement>(null);
  const localSeatRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<TableGeometry | null>(null);
  const signatureRef = useRef<string | null>(null);
  const epochRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const felt = feltRef.current;
    if (!felt || document.visibilityState === "hidden") return;
    const bounds = felt.getBoundingClientRect();
    if (bounds.width < 100 || bounds.height < 100 || window.innerWidth < 100 || window.innerHeight < 100) return;
    const next = computeTableGeometry({
      feltRect: bounds,
      topHandRect: topSeatRef.current?.querySelector("[data-remote-hand]")?.getBoundingClientRect(),
      leftHandRect: leftSeatRef.current?.querySelector("[data-remote-hand]")?.getBoundingClientRect(),
      rightHandRect: rightSeatRef.current?.querySelector("[data-remote-hand]")?.getBoundingClientRect(),
      topSeatRect: topSeatRef.current?.getBoundingClientRect(),
      leftSeatRect: leftSeatRef.current?.getBoundingClientRect(),
      rightSeatRect: rightSeatRef.current?.getBoundingClientRect(),
      localSeatRect: localSeatRef.current?.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      desktopPointer: window.matchMedia(DESKTOP_TABLE_QUERY).matches,
    });
    const signature = geometrySignature(next);
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;
    epochRef.current += 1;
    setGeometry({ ...next, epoch: epochRef.current });
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    const nodes = [
      feltRef.current,
      topSeatRef.current,
      leftSeatRef.current,
      rightSeatRef.current,
      localSeatRef.current,
    ].filter((node): node is HTMLDivElement => Boolean(node));
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    for (const node of nodes) observer?.observe(node);

    const desktopMedia = window.matchMedia(DESKTOP_TABLE_QUERY);
    desktopMedia.addEventListener("change", scheduleMeasure);
    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("orientationchange", scheduleMeasure);
    document.addEventListener("fullscreenchange", scheduleMeasure);
    // Mobile Chrome/PWA can restore a different visual viewport without firing resize.
    // Recheck immediately on foreground and once again on the next paint, no timers.
    const onForeground = () => {
      if (document.visibilityState === "visible") {
        measure();
        scheduleMeasure();
      }
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("pageshow", onForeground);
    window.addEventListener("focus", onForeground);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    return () => {
      observer?.disconnect();
      desktopMedia.removeEventListener("change", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
      document.removeEventListener("fullscreenchange", scheduleMeasure);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("pageshow", onForeground);
      window.removeEventListener("focus", onForeground);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [scheduleMeasure]);

  useEffect(() => { scheduleMeasure(); }, [layoutKey, scheduleMeasure]);

  return { feltRef, topSeatRef, leftSeatRef, rightSeatRef, localSeatRef, geometry };
}
