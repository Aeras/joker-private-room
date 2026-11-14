import { Application } from "pixi.js";
import { DurakScene } from "./DurakScene";
import type { DurakRenderState } from "./types/renderState";
import type { DurakInputCallbacks, DurakSceneDiagnostics } from "./types/sceneEvents";
import { calculateViewport, LOGICAL_WIDTH, LOGICAL_HEIGHT, type DurakViewport } from "./core/coordinateSystem";

export class DurakPixiRuntime {
  private app: Application | null = null;
  private scene: DurakScene | null = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private callbacks: DurakInputCallbacks;
  private isDestroyed = false;
  private isReady = false;

  constructor(callbacks: DurakInputCallbacks) {
    this.callbacks = callbacks;
  }

  async init(hostElement: HTMLElement): Promise<void> {
    if (this.isDestroyed || typeof window === "undefined") return;

    // Guard against headless test environments (like jsdom) where HTMLCanvasElement has no 2D/WebGL context
    try {
      const testCanvas = document.createElement("canvas");
      const ctx = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl") || testCanvas.getContext("2d");
      if (!ctx) return;
    } catch {
      return;
    }

    this.container = hostElement;
    const initialWidth = hostElement.clientWidth || LOGICAL_WIDTH;
    const initialHeight = hostElement.clientHeight || LOGICAL_HEIGHT;
    const initialViewport = calculateViewport(initialWidth, initialHeight);

    const app = new Application();
    await app.init({
      width: initialWidth,
      height: initialHeight,
      resolution: initialViewport.dpr,
      autoDensity: true,
      antialias: true,
      backgroundColor: 0x060c18, // Match deep midnight blue casino table felt
      powerPreference: "high-performance",
    });

    if (this.isDestroyed) {
      app.destroy(true, { children: true });
      return;
    }

    this.app = app;
    hostElement.appendChild(app.canvas);

    // Initialize scene
    this.scene = new DurakScene(app.ticker, this.callbacks);
    await this.scene.init();

    app.stage.addChild(this.scene.stage);

    // Apply initial scale & layout
    this.applyViewport(initialViewport);

    // Resize observer
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const vp = calculateViewport(width, height);
          this.applyViewport(vp);
        }
      }
    });
    this.resizeObserver.observe(hostElement);

    this.isReady = true;
  }

  private applyViewport(vp: DurakViewport): void {
    if (!this.app || !this.scene) return;

    this.app.renderer.resize(vp.screenWidth, vp.screenHeight);

    // Scale root stage so content scales proportionally
    this.scene.stage.scale.set(vp.scale);

    // Center logical stage within screen
    const offsetX = (vp.screenWidth - LOGICAL_WIDTH * vp.scale) / 2;
    const offsetY = (vp.screenHeight - LOGICAL_HEIGHT * vp.scale) / 2;
    this.scene.stage.position.set(offsetX, offsetY);

    // Table background expands to cover 100% of the screen edge to edge
    this.scene.resizeBackground(
      vp.screenWidth / vp.scale,
      vp.screenHeight / vp.scale,
      -offsetX / vp.scale,
      -offsetY / vp.scale
    );
  }

  updateState(state: DurakRenderState): void {
    if (!this.isReady || !this.scene || this.isDestroyed) return;
    this.scene.render(state);
  }

  getDiagnostics(): DurakSceneDiagnostics {
    return {
      renderer: "webgl",
      dpr: window.devicePixelRatio || 1,
      width: this.container?.clientWidth || 0,
      height: this.container?.clientHeight || 0,
      fps: Math.round(this.app?.ticker?.FPS || 60),
      activeSprites: 0,
      activeAnimations: 0,
    };
  }

  destroy(): void {
    this.isDestroyed = true;
    this.isReady = false;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.scene) {
      this.scene.destroy();
      this.scene = null;
    }

    if (this.app) {
      if (this.app.canvas?.parentElement) {
        this.app.canvas.parentElement.removeChild(this.app.canvas);
      }
      this.app.destroy(true, { children: true });
      this.app = null;
    }

    this.container = null;
  }
}
