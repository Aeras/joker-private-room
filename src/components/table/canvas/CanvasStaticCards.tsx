import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { assets } from "@/assets/registry";
import { canvasCardAssets, canvasFlightAvailable } from "./assetCache";

/**
 * Static card artwork only: DOM remains the geometry/accessible fallback.
 * No idle RAF, no canonical information and no gameplay input in this canvas.
 */
export function CanvasStaticCards({
  kind, count, visualSeat, faceUrl, children,
}: {
  kind: "remote" | "trump";
  count: number;
  visualSeat?: 1 | 2 | 3;
  faceUrl?: string | undefined;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = `${kind}:${visualSeat ?? "trump"}:${faceUrl ?? "back"}`;

  useLayoutEffect(() => {
    setPainted(false);
    setReady(false);
    setFailed(false);
    if (!canvasFlightAvailable()) return;
    let active = true;
    void Promise.all([canvasCardAssets.warm(assets.cardBack), ...(faceUrl ? [canvasCardAssets.warm(faceUrl)] : [])])
      .then(images => { if (active) if (images.every(Boolean)) setReady(true); else setFailed(true); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [key, faceUrl]);

  useLayoutEffect(() => {
    if (!ready || failed) return;
    const root = host.current;
    const canvas = surface.current;
    if (!root || !canvas) return;
    let disposed = false;
    const redraw = () => {
      if (disposed) return;
      const first = root.querySelector<HTMLElement>("[data-static-card-measure]");
      const back = canvasCardAssets.peek(assets.cardBack);
      const face = faceUrl ? canvasCardAssets.peek(faceUrl) : null;
      if (!first || !back || (faceUrl && !face)) { setPainted(false); return; }
      const w = first.offsetWidth;
      const h = first.offsetHeight;
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      if (w <= 0 || h <= 0 || width <= 0 || height <= 0) { setPainted(false); return; }
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pixelW = Math.max(1, Math.ceil(width * dpr));
        const pixelH = Math.max(1, Math.ceil(height * dpr));
        if (canvas.width !== pixelW) canvas.width = pixelW;
        if (canvas.height !== pixelH) canvas.height = pixelH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("NO_CANVAS_CONTEXT");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const draw = (image: CanvasImageSource, x: number, y: number, angle = 0) => {
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate(angle);
          ctx.beginPath();
          const radius = Math.min(8, w / 9);
          ctx.roundRect(-w / 2, -h / 2, w, h, radius);
          ctx.clip();
          ctx.drawImage(image, -w / 2, -h / 2, w, h);
          ctx.restore();
        };
        if (kind === "remote") {
          const side = visualSeat === 1 || visualSeat === 3;
          for (let i = 0; i < Math.min(count, 9); i++) {
            if (side) {
              const offset = i * w * 0.1;
              draw(back, w * 0.2, -w * 0.2 + offset, visualSeat === 1 ? Math.PI / 2 : -Math.PI / 2);
            } else {
              draw(back, i * w * 0.1, 0);
            }
          }
        } else {
          // Match the existing stacked exposed-trump DOM: two backs behind one face.
          draw(back, 6, -4);
          draw(back, 3, -2);
          draw(face ?? back, 0, 0);
        }
        setPainted(true);
      } catch { setPainted(false); setFailed(true); }
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(root);
    redraw();
    const lost = (event: Event) => { event.preventDefault(); setPainted(false); setFailed(true); };
    canvas.addEventListener("contextlost", lost);
    window.addEventListener("resize", redraw);
    return () => {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("contextlost", lost);
      window.removeEventListener("resize", redraw);
    };
  }, [ready, failed, key, kind, count, visualSeat, faceUrl]);

  return <div ref={host} data-static-card-canvas={kind} data-canvas-ready={painted ? "true" : "false"} className="relative h-full w-full">
    <div style={{ opacity: painted ? 0 : 1 }} aria-hidden={kind === "trump" ? undefined : true}>
      {children}
    </div>
    {ready && !failed && <canvas ref={surface} aria-hidden="true" data-static-card-surface={kind}
      className="pointer-events-none absolute left-0 top-0 h-full w-full"
      style={{ opacity: painted ? 1 : 0 }} />}
  </div>;
}
