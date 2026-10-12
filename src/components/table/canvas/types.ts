export interface SpritePose { x: number; y: number; width: number; height: number; rotation: number; opacity: number; flip: number }
export interface CardSprite { id: string; image: CanvasImageSource; backImage?: CanvasImageSource; pose: SpritePose; layer: number }
export interface FrameDriver { now(): number; request(callback: FrameRequestCallback): number; cancel(id: number): void }
export const browserFrames: FrameDriver = { now: () => performance.now(), request: cb => requestAnimationFrame(cb), cancel: id => cancelAnimationFrame(id) };
export function validPose(p: SpritePose): boolean { return Object.values(p).every(Number.isFinite) && p.width > 0 && p.height > 0 && p.opacity >= 0 && p.opacity <= 1; }

