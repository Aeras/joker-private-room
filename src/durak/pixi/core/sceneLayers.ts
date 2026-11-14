import { Container } from "pixi.js";

/** Explicit deterministic scene layers.
 * Guarantees visual hierarchy and eliminates z-fighting or race conditions.
 */
export class DurakSceneLayers {
  readonly root: Container;
  readonly backgroundLayer: Container;
  readonly tableLayer: Container;
  readonly tableDecorationLayer: Container;
  readonly seatLayer: Container;
  readonly opponentHandLayer: Container;
  readonly stockLayer: Container;
  readonly discardPileLayer: Container;
  readonly battleLayer: Container;
  readonly localHandLayer: Container;
  readonly dragLayer: Container;
  readonly animationLayer: Container;
  readonly effectsLayer: Container;

  constructor() {
    this.root = new Container();
    this.root.label = "DurakRoot";

    this.backgroundLayer = new Container();
    this.backgroundLayer.label = "BackgroundLayer";

    this.tableLayer = new Container();
    this.tableLayer.label = "TableLayer";

    this.tableDecorationLayer = new Container();
    this.tableDecorationLayer.label = "TableDecorationLayer";

    this.seatLayer = new Container();
    this.seatLayer.label = "SeatLayer";

    this.opponentHandLayer = new Container();
    this.opponentHandLayer.label = "OpponentHandLayer";

    this.stockLayer = new Container();
    this.stockLayer.label = "StockLayer";

    this.discardPileLayer = new Container();
    this.discardPileLayer.label = "DiscardPileLayer";

    this.battleLayer = new Container();
    this.battleLayer.label = "BattleLayer";

    this.localHandLayer = new Container();
    this.localHandLayer.label = "LocalHandLayer";

    this.dragLayer = new Container();
    this.dragLayer.label = "DragLayer";

    this.animationLayer = new Container();
    this.animationLayer.label = "AnimationLayer";

    this.effectsLayer = new Container();
    this.effectsLayer.label = "EffectsLayer";

    // Strict z-ordering
    this.root.addChild(
      this.backgroundLayer,
      this.tableLayer,
      this.tableDecorationLayer,
      this.seatLayer,
      this.opponentHandLayer,
      this.stockLayer,
      this.discardPileLayer,
      this.battleLayer,
      this.localHandLayer,
      this.dragLayer,
      this.animationLayer,
      this.effectsLayer
    );
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
