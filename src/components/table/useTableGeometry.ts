import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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
  trickCardSize: { width: number; height: number };
}

interface GeometryInput {
  feltRect: RectLike;
  topSeatRect?: RectLike | null | undefined;
  leftSeatRect?: RectLike | null | undefined;
  rightSeatRect?: RectLike | null | undefined;
  localSeatRect?: RectLike | null | undefined;
  viewportWidth: number;
  viewportHeight: number;
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

  // Mirrors PlayingCard's clamp(3rem, 6vw, 5rem) at the default 16px root size.
  const cardWidth = clamp(input.viewportWidth * 0.06, 48, 80);
  const cardHeight = cardWidth * 7 / 5;
  const horizontalOffset = cardWidth * 0.62;
  const verticalOffset = cardHeight * 0.42;

  const seatOrigins: Record<VisualSeat, Point> = {
    0: input.localSeatRect ? centerOf(input.localSeatRect, feltRect) : fallback[0],
    1: input.leftSeatRect ? centerOf(input.leftSeatRect, feltRect) : fallback[1],
    2: input.topSeatRect ? centerOf(input.topSeatRect, feltRect) : fallback[2],
    3: input.rightSeatRect ? centerOf(input.rightSeatRect, feltRect) : fallback[3],
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
    localHandCenter: { x: usableCenter.x, y: height },
    trickCardSize: { width: cardWidth, height: cardHeight },
  };
}

function geometrySignature(value: Omit<TableGeometry, "epoch">): string {
  const p = (number: number) => Math.round(number * 2) / 2;
  return [
    p(value.feltRect.width), p(value.feltRect.height),
    p(value.usableBounds.left), p(value.usableBounds.top),
    p(value.usableBounds.right), p(value.usableBounds.bottom),
    p(value.dealCenter.x), p(value.dealCenter.y),
    ...([0, 1, 2, 3] as VisualSeat[]).flatMap((seat) => [
      p(value.seatOrigins[seat].x), p(value.seatOrigins[seat].y),
      p(value.dealTargets[seat].x), p(value.dealTargets[seat].y),
    ]),
  ].join(":");
}

export function useTableGeometry(): {
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
    if (!felt) return;
    const next = computeTableGeometry({
      feltRect: felt.getBoundingClientRect(),
      topSeatRect: topSeatRef.current?.getBoundingClientRect(),
      leftSeatRect: leftSeatRef.current?.getBoundingClientRect(),
      rightSeatRect: rightSeatRef.current?.getBoundingClientRect(),
      localSeatRect: localSeatRef.current?.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
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
    const nodes = [feltRef.current, topSeatRef.current, leftSeatRef.current, rightSeatRef.current, localSeatRef.current]
      .filter((node): node is HTMLDivElement => Boolean(node));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    for (const node of nodes) observer?.observe(node);

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("orientationchange", scheduleMeasure);
    document.addEventListener("fullscreenchange", scheduleMeasure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
      document.removeEventListener("fullscreenchange", scheduleMeasure);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [scheduleMeasure]);

  return { feltRef, topSeatRef, leftSeatRef, rightSeatRef, localSeatRef, geometry };
}
