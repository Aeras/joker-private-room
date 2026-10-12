export interface SpritePose {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  flip: number;
  layer?: number;
  backBlend?: number;
  shade?: number;
  emphasis?: number;
}
export interface CardSprite {
  id: string;
  image: CanvasImageSource;
  backImage?: CanvasImageSource;
  pose: SpritePose;
  layer: number;
}
export interface FrameDriver {
  now(): number;
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}
export const browserFrames: FrameDriver = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};
export function validPose(p: SpritePose): boolean {
  return (
    Object.values(p).every(Number.isFinite) &&
    p.width > 0 &&
    p.height > 0 &&
    p.opacity >= 0 &&
    p.opacity <= 1 &&
    (p.backBlend == null || (p.backBlend >= 0 && p.backBlend <= 1)) &&
    (p.shade == null || (p.shade >= 0 && p.shade <= 1)) &&
    (p.emphasis == null || (p.emphasis >= 0 && p.emphasis <= 1))
  );
}
