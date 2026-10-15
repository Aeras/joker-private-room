import { useEffect, useRef, useState } from "react";
import { Application, Assets, Container, Sprite, Texture } from "pixi.js";
import type { BiribaDealtPreview } from "./localDeal";
import type { BiribaGameView } from "@/services/biribaFunctions";
import { NORMAL_DEAL_TRAVEL_MS } from "@/components/table/presentationTiming";
import { dealtCardPose, dealProgress } from "@/components/table/dealtCardMotion";
import { opponentFanPose, type BiribaOpponentSide } from "./tableLayout";
import {
  BACK_ARTWORK,
  biribaDealKey,
  biribaCardArtwork,
  biribaVisualCards,
  newDiscardFromSingleMove,
  type MeldFlight,
  shouldAnimateFreshDeal,
  visibleOpponentSides,
  type BiribaVisualGame,
  type VisualCard,
} from "./biribaVisualModel";

export const BIRIBA_DEAL_BEAT_MS = 110;
const EMPTY_MELD_FLIGHTS: readonly MeldFlight[] = [];
const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
type Tick = (ticker: { deltaMS: number }) => void;
type CardSprite = { sprite: Sprite; artwork: string; request: number; loaded: boolean };
type Scene = {
  app: Application;
  stage: Container;
  cards: Map<string, CardSprite>;
  timers: Set<ReturnType<typeof setTimeout>>;
  tickers: Set<Tick>;
  motions: Map<string, Tick>;
  disposed: boolean;
  dealToken: number;
  dealActive: boolean;
  dealKey: string | null;
  completedDeals: Set<string>;
  lastProjection: BiribaVisualGame | null;
  discardToken: number;
  activeDiscardId: string | null;
  meldToken: number;
  meldCleanups: Map<string, () => void>;
};

function schedule(scene: Scene, callback: () => void, delay: number) {
  const timer = setTimeout(() => {
    scene.timers.delete(timer);
    if (!scene.disposed) callback();
  }, delay);
  scene.timers.add(timer);
}
function addTick(scene: Scene, tick: Tick) {
  scene.tickers.add(tick);
  scene.app.ticker.add(tick);
}
function removeTick(scene: Scene, tick: Tick) {
  scene.app.ticker.remove(tick);
  scene.tickers.delete(tick);
}
function removeCard(scene: Scene, id: string) {
  const motion = scene.motions.get(id);
  if (motion) {
    removeTick(scene, motion);
    scene.motions.delete(id);
  }
  const card = scene.cards.get(id);
  if (!card) return;
  scene.cards.delete(id);
  scene.stage.removeChild(card.sprite);
  card.sprite.destroy();
}
function setCard(scene: Scene, card: VisualCard, animate = false) {
  let entry = scene.cards.get(card.id);
  const existing = Boolean(entry);
  if (!entry) {
    const sprite = new Sprite(Texture.WHITE);
    sprite.visible = false;
    sprite.anchor.set(card.id.startsWith("fan:") ? 0.5 : 0);
    scene.stage.addChild(sprite);
    entry = { sprite, artwork: "", request: 0, loaded: false };
    scene.cards.set(card.id, entry);
  }
  const priorMotion = scene.motions.get(card.id);
  if (priorMotion) {
    removeTick(scene, priorMotion);
    scene.motions.delete(card.id);
  }
  const startX = entry.sprite.x;
  const startY = entry.sprite.y;
  const startAngle = entry.sprite.rotation;
  const targetAngle = (card.angle * Math.PI) / 180;
  if (
    existing &&
    animate &&
    card.id.startsWith("fan:") &&
    entry.sprite.visible &&
    (Math.abs(startX - card.x) > 0.01 ||
      Math.abs(startY - card.y) > 0.01 ||
      Math.abs(startAngle - targetAngle) > 0.001)
  ) {
    let elapsed = 0;
    const tick: Tick = ({ deltaMS }) => {
      elapsed += deltaMS;
      const t = Math.min(1, elapsed / 220);
      const eased = 1 - Math.pow(1 - t, 3);
      entry!.sprite.position.set(
        startX + (card.x - startX) * eased,
        startY + (card.y - startY) * eased,
      );
      entry!.sprite.rotation = startAngle + (targetAngle - startAngle) * eased;
      if (t === 1) {
        removeTick(scene, tick);
        scene.motions.delete(card.id);
      }
    };
    scene.motions.set(card.id, tick);
    addTick(scene, tick);
  } else {
    entry.sprite.position.set(card.x, card.y);
    entry.sprite.rotation = targetAngle;
  }
  entry.sprite.width = card.width;
  entry.sprite.height = card.height;
  if (entry.artwork === card.artwork) {
    // A cancelled deal may leave an already textured fan sprite hidden before its beat.
    if (entry.loaded) entry.sprite.visible = true;
    return;
  }
  entry.artwork = card.artwork;
  const request = ++entry.request;
  const target = entry;
  void Assets.load(card.artwork)
    .then((texture: Texture) => {
      if (
        scene.disposed ||
        scene.cards.get(card.id) !== target ||
        target.request !== request ||
        target.artwork !== card.artwork
      )
        return;
      target.sprite.texture = texture;
      target.loaded = true;
      target.sprite.width = card.width;
      target.sprite.height = card.height;
      target.sprite.visible = true;
    })
    .catch(() => {
      if (scene.disposed || scene.cards.get(card.id) !== target || target.request !== request)
        return;
      target.sprite.texture = Texture.WHITE;
      target.loaded = true;
      target.sprite.tint = card.artwork === BACK_ARTWORK ? 0x1e3a8a : 0xffffff;
      target.sprite.width = card.width;
      target.sprite.height = card.height;
      target.sprite.visible = true;
    });
}
function syncCards(scene: Scene, game: BiribaVisualGame, animate = false) {
  const desired = biribaVisualCards(game, !scene.dealActive);
  const ids = new Set(desired.map((card) => card.id));
  for (const card of desired) setCard(scene, card, animate);
  for (const id of [...scene.cards.keys()]) {
    if (id.startsWith("deal:local:")) continue;
    if (id.startsWith("flight:meld:")) continue;
    if (scene.dealActive && id.startsWith("fan:")) continue;
    if (!ids.has(id)) removeCard(scene, id);
  }
  scene.lastProjection = game;
}
function cancelDiscardFlight(scene: Scene) {
  scene.discardToken++;
  scene.activeDiscardId = null;
  removeCard(scene, "flight:discard");
}
function cancelMeldFlights(scene: Scene) {
  scene.meldToken++;
  for (const cleanup of scene.meldCleanups.values()) cleanup();
  scene.meldCleanups.clear();
  for (const id of [...scene.cards.keys()])
    if (id.startsWith("flight:meld:")) removeCard(scene, id);
}
function discardOrigin(game: BiribaVisualGame, seat: number) {
  if (seat === game.seat) return { x: 640, y: 650 };
  const side = visibleOpponentSides(game).find((item) => item.seat === seat)?.side;
  if (side === "top") return { x: 640, y: 80 };
  if (side === "left") return { x: 80, y: 280 };
  return { x: 1200, y: 280 };
}
function startMeldFlights(
  scene: Scene,
  parent: HTMLElement,
  game: BiribaGameView,
  flights: readonly MeldFlight[],
  onComplete: (id: string) => void,
) {
  cancelMeldFlights(scene);
  if (!flights.length) return;
  const token = scene.meldToken;
  for (const { card, actorSeat } of flights) {
    const target = [...document.querySelectorAll<HTMLImageElement>("[data-biriba-card-id]")].find(
      (element) => element.dataset["biribaCardId"] === card.id,
    );
    if (!target || reducedMotion() || document.visibilityState !== "visible") {
      onComplete(card.id);
      continue;
    }
    const table = parent.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (table.width <= 0 || table.height <= 0 || rect.width <= 0 || rect.height <= 0) {
      onComplete(card.id);
      continue;
    }
    const end = {
      x: ((rect.left + rect.width / 2 - table.left) / table.width) * 1280,
      y: ((rect.top + rect.height / 2 - table.top) / table.height) * 720,
    };
    const start = discardOrigin(game, actorSeat);
    const artwork = biribaCardArtwork(card);
    void Assets.load(artwork)
      .then((texture: Texture) => {
        if (scene.disposed || scene.meldToken !== token) return;
        const id = `flight:meld:${card.id}`;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = (rect.width / table.width) * 1280;
        sprite.height = (rect.height / table.height) * 720;
        sprite.position.set(start.x, start.y);
        scene.stage.addChild(sprite);
        scene.cards.set(id, { sprite, artwork, request: 0, loaded: true });
        let elapsed = 0;
        const tick: Tick = ({ deltaMS }) => {
          elapsed += deltaMS;
          const progress = dealProgress(Math.min(1, elapsed / 360));
          const pose = dealtCardPose(start, end, 0, 0, progress);
          sprite.position.set(pose.point.x, pose.point.y);
          if (elapsed < 360) return;
          removeTick(scene, tick);
          scene.motions.delete(id);
          sprite.position.set(end.x, end.y);
          let settled = false;
          const finish = () => {
            if (settled || scene.meldToken !== token) return;
            settled = true;
            observer.disconnect();
            scene.meldCleanups.delete(id);
            removeCard(scene, id);
          };
          const observer = new MutationObserver(() => {
            if (target.style.visibility !== "hidden") finish();
          });
          observer.observe(target, { attributes: true, attributeFilter: ["style"] });
          scene.meldCleanups.set(id, () => {
            observer.disconnect();
            settled = true;
          });
          onComplete(card.id);
          if (target.style.visibility !== "hidden") finish();
          schedule(scene, finish, 350);
        };
        scene.motions.set(id, tick);
        addTick(scene, tick);
      })
      .catch(() => {
        if (scene.disposed || scene.meldToken !== token) return;
        onComplete(card.id);
      });
  }
}
function startDiscardFlight(scene: Scene, previous: BiribaVisualGame, next: BiribaVisualGame) {
  const card = newDiscardFromSingleMove(previous, next);
  if (!card || previous.turn === undefined) return;
  cancelDiscardFlight(scene);
  scene.activeDiscardId = card.id;
  const token = scene.discardToken;
  const artwork = biribaCardArtwork(card);
  const from = discardOrigin(next, previous.turn);
  const to = { x: 548, y: 395 };
  void Assets.load(artwork)
    .then((texture: Texture) => {
      if (scene.disposed || scene.discardToken !== token) return;
      const sprite = new Sprite(texture);
      sprite.width = 68.44;
      sprite.height = 100.3;
      sprite.position.set(from.x, from.y);
      scene.stage.addChild(sprite);
      scene.cards.set("flight:discard", { sprite, artwork, request: 0, loaded: true });
      let elapsed = 0;
      const tick: Tick = ({ deltaMS }) => {
        elapsed += deltaMS;
        const progress = dealProgress(Math.min(1, elapsed / 320));
        const pose = dealtCardPose(from, to, 0, 0, progress);
        sprite.position.set(pose.point.x, pose.point.y);
        if (elapsed < 320) return;
        removeTick(scene, tick);
        scene.motions.delete("flight:discard");
        removeCard(scene, "discard:top");
        scene.cards.delete("flight:discard");
        sprite.position.set(to.x, to.y);
        scene.cards.set("discard:top", { sprite, artwork, request: 0, loaded: true });
        scene.activeDiscardId = null;
      };
      scene.motions.set("flight:discard", tick);
      addTick(scene, tick);
    })
    .catch(() => {
      if (scene.disposed || scene.discardToken !== token) return;
      scene.activeDiscardId = null;
      syncCards(scene, next);
    });
}
function cancelDeal(scene: Scene) {
  cancelDiscardFlight(scene);
  cancelMeldFlights(scene);
  scene.dealToken++;
  scene.dealActive = false;
  for (const timer of scene.timers) clearTimeout(timer);
  scene.timers.clear();
  for (const tick of scene.tickers) scene.app.ticker.remove(tick);
  scene.tickers.clear();
  scene.motions.clear();
  for (const id of [...scene.cards.keys()]) if (id.startsWith("deal:local:")) removeCard(scene, id);
}
function destination(side: BiribaOpponentSide | "local", index: number) {
  return side === "local"
    ? { x: 640 + (index - 5) * 10, y: 665, angle: 0 }
    : opponentFanPose(side, index, 11);
}
function origin(side: BiribaOpponentSide | "local", end: { x: number; y: number }) {
  if (side === "top") return { x: end.x, y: -110 };
  if (side === "left") return { x: -110, y: end.y };
  if (side === "right") return { x: 1390, y: end.y };
  return { x: end.x, y: 820 };
}
function startDeal(
  scene: Scene,
  game: BiribaGameView,
  key: string,
  latestGame: () => BiribaGameView | undefined,
  onComplete: (key: string) => void,
) {
  cancelDeal(scene);
  scene.dealActive = true;
  scene.dealKey = key;
  syncCards(scene, game);
  const token = scene.dealToken;
  const order: Array<{ side: BiribaOpponentSide | "local"; seat: number }> = [
    { side: "local", seat: game.seat },
    ...visibleOpponentSides(game),
  ];
  void Assets.load(BACK_ARTWORK)
    .then((texture: Texture) => {
      if (scene.disposed || scene.dealToken !== token) return;
      try {
        sessionStorage.setItem(`biriba-deal:${key}`, "1");
      } catch {
        /* optional */
      }
      for (let index = 0; index < 11; index++)
        for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
          const { side } = order[orderIndex]!;
          const id = side === "local" ? `deal:local:${index}` : `fan:${side}:${index}`;
          const end = destination(side, index);
          const start = origin(side, end);
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          sprite.width = 70;
          sprite.height = 100;
          sprite.position.set(start.x, start.y);
          sprite.visible = false;
          scene.stage.addChild(sprite);
          scene.cards.set(id, { sprite, artwork: BACK_ARTWORK, request: 0, loaded: true });
          schedule(
            scene,
            () => {
              if (scene.dealToken !== token) return;
              let elapsed = 0;
              sprite.visible = true;
              const tick: Tick = ({ deltaMS }) => {
                elapsed += deltaMS;
                const progress = dealProgress(Math.min(1, elapsed / NORMAL_DEAL_TRAVEL_MS));
                const pose = dealtCardPose(start, end, 0, end.angle, progress);
                sprite.position.set(pose.point.x, pose.point.y);
                sprite.rotation = (pose.rotation * Math.PI) / 180;
                if (elapsed >= NORMAL_DEAL_TRAVEL_MS) {
                  sprite.position.set(end.x, end.y);
                  sprite.rotation = (end.angle * Math.PI) / 180;
                  sprite.width = side === "top" ? 58 : side === "local" ? 70 : 75;
                  sprite.height = side === "top" ? 82 : side === "local" ? 100 : 105;
                  removeTick(scene, tick);
                }
              };
              addTick(scene, tick);
            },
            (index * order.length + orderIndex) * BIRIBA_DEAL_BEAT_MS,
          );
        }
      schedule(
        scene,
        () => {
          if (scene.dealToken !== token || scene.completedDeals.has(key)) return;
          scene.completedDeals.add(key);
          scene.dealActive = false;
          syncCards(scene, latestGame() ?? game);
          onComplete(key);
          // React commits the face-up hand before the temporary local backs leave.
          schedule(
            scene,
            () => {
              if (scene.dealToken !== token) return;
              for (const id of [...scene.cards.keys()])
                if (id.startsWith("deal:local:")) removeCard(scene, id);
            },
            80,
          );
        },
        (11 * order.length - 1) * BIRIBA_DEAL_BEAT_MS + NORMAL_DEAL_TRAVEL_MS + 30,
      );
    })
    .catch(() => {
      if (scene.disposed || scene.dealToken !== token) return;
      try {
        sessionStorage.setItem(`biriba-deal:${key}`, "1");
      } catch {
        /* optional */
      }
      scene.dealActive = false;
      scene.completedDeals.add(key);
      syncCards(scene, latestGame() ?? game);
      onComplete(key);
    });
}

export function BiribaPixiPreview({
  animateDeal = true,
  deal,
  game,
  revealComplete = false,
  onDealComplete,
  roomCode,
  meldFlights = EMPTY_MELD_FLIGHTS,
  onMeldFlightComplete,
}: {
  animateDeal?: boolean;
  deal?: BiribaDealtPreview | undefined;
  game?: BiribaGameView | undefined;
  redTeam?: number;
  revealComplete?: boolean;
  onDealComplete?: (key: string) => void;
  roomCode?: string;
  meldFlights?: readonly MeldFlight[];
  onMeldFlightComplete?: (id: string) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const latestGame = useRef(game);
  const latestMeldFlights = useRef(meldFlights);
  const latestDealKey = useRef<string | null>(null);
  const callback = useRef(onDealComplete);
  const meldCallback = useRef(onMeldFlightComplete);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  latestGame.current = game;
  latestMeldFlights.current = meldFlights;
  latestDealKey.current = game
    ? biribaDealKey(roomCode ?? "room", game.roundNumber, game.seat)
    : null;
  callback.current = onDealComplete;
  meldCallback.current = onMeldFlightComplete;

  useEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let scene: Scene | null = null;
    let canvas: HTMLCanvasElement | null = null;
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (scene && !scene.disposed) {
        cancelDeal(scene);
        scene.disposed = true;
      }
      setFailed(true);
    };
    const background = () => {
      if (document.visibilityState !== "hidden" || !scene || scene.disposed) return;
      const wasDealing = scene.dealActive;
      cancelDeal(scene);
      if (latestGame.current) syncCards(scene, latestGame.current);
      if (wasDealing && latestDealKey.current && !scene.completedDeals.has(latestDealKey.current)) {
        scene.completedDeals.add(latestDealKey.current);
        callback.current?.(latestDealKey.current);
      }
      for (const flight of latestMeldFlights.current) meldCallback.current?.(flight.card.id);
    };
    document.addEventListener("visibilitychange", background);
    void (async () => {
      const app = new Application();
      try {
        await app.init({
          resizeTo: parent,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        });
      } catch {
        try {
          app.destroy(true);
        } catch {
          /* Partial WebGL initialization may not own a renderer. */
        }
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled) {
        app.destroy(true);
        return;
      }
      const stage = new Container();
      app.stage.addChild(stage);
      scene = {
        app,
        stage,
        cards: new Map(),
        timers: new Set(),
        tickers: new Set(),
        motions: new Map(),
        disposed: false,
        dealToken: 0,
        dealActive: false,
        dealKey: null,
        completedDeals: new Set(),
        lastProjection: null,
        discardToken: 0,
        activeDiscardId: null,
        meldToken: 0,
        meldCleanups: new Map(),
      };
      sceneRef.current = scene;
      parent.appendChild(app.canvas);
      canvas = app.canvas;
      canvas.addEventListener("webglcontextlost", contextLost);
      const resize = () => {
        if (!scene || scene.disposed) return;
        app.resize();
        stage.scale.set(parent.clientWidth / 1280, parent.clientHeight / 720);
      };
      observer = new ResizeObserver(resize);
      observer.observe(parent);
      resize();
      setReady(true);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", background);
      canvas?.removeEventListener("webglcontextlost", contextLost);
      if (!scene) return;
      if (!scene.disposed) cancelDeal(scene);
      scene.disposed = true;
      if (sceneRef.current === scene) sceneRef.current = null;
      scene.app.destroy(true, { children: true });
    };
  }, []);

  const currentDealKey = game
    ? biribaDealKey(roomCode ?? "room", game.roundNumber, game.seat)
    : null;
  useEffect(() => {
    if (failed && currentDealKey) callback.current?.(currentDealKey);
  }, [failed, currentDealKey]);

  useEffect(() => {
    if (failed) for (const flight of meldFlights) meldCallback.current?.(flight.card.id);
  }, [failed, meldFlights]);

  const projectionKey = game
    ? JSON.stringify({
        round: game.roundNumber,
        seat: game.seat,
        seats: game.seats,
        stock: game.stockCount,
        packets: game.packetCounts,
        hands: game.handCounts,
        discard: game.discards.at(-1)?.id,
        phase: game.phase,
        ended: game.roundEnded,
      })
    : null;
  useEffect(() => {
    if (!ready || failed || !sceneRef.current) return;
    const scene = sceneRef.current;
    const visual =
      game ??
      (deal
        ? {
            seats: deal.seats,
            seat: 0,
            roundNumber: 0,
            revision: 0,
            stockCount: deal.stock.length,
            packetCounts: deal.packets.map((packet) => packet.length),
            handCounts: deal.hands.map((hand) => hand.length),
            discards: deal.discard,
          }
        : null);
    if (!visual) return;
    const key = game ? biribaDealKey(roomCode ?? "room", game.roundNumber, game.seat) : null;
    if (scene.dealKey !== key) {
      cancelDeal(scene);
      scene.dealKey = key;
      scene.lastProjection = null;
      // A new round owns a new visual scene; no old-round pile may remain.
      for (const id of [...scene.cards.keys()]) removeCard(scene, id);
      let stored: string | null = null;
      try {
        stored = key ? sessionStorage.getItem(`biriba-deal:${key}`) : null;
      } catch {
        /* storage is optional */
      }
      if (
        game &&
        key &&
        animateDeal &&
        !revealComplete &&
        !stored &&
        !reducedMotion() &&
        shouldAnimateFreshDeal(game)
      ) {
        startDeal(
          scene,
          game,
          key,
          () => latestGame.current,
          (value) => callback.current?.(value),
        );
        return;
      }
      if (game && key && !revealComplete && !scene.completedDeals.has(key)) {
        scene.completedDeals.add(key);
        callback.current?.(key);
      }
    }
    if (scene.dealActive && (revealComplete || (game && !shouldAnimateFreshDeal(game)))) {
      cancelDeal(scene);
      if (key && !scene.completedDeals.has(key)) {
        scene.completedDeals.add(key);
        callback.current?.(key);
      }
    }
    const previous = scene.lastProjection;
    if (
      scene.activeDiscardId === visual.discards.at(-1)?.id &&
      previous?.revision === visual.revision
    )
      return;
    const animate = Boolean(
      game &&
      previous &&
      !scene.dealActive &&
      game.roundNumber === previous.roundNumber &&
      game.revision === previous.revision + 1 &&
      document.visibilityState === "visible" &&
      !reducedMotion(),
    );
    const discard = animate ? newDiscardFromSingleMove(previous, visual) : null;
    if (discard && previous) {
      syncCards(scene, { ...visual, discards: previous.discards }, animate);
      scene.lastProjection = visual;
      startDiscardFlight(scene, previous, visual);
    } else {
      if (scene.activeDiscardId) cancelDiscardFlight(scene);
      syncCards(scene, visual, animate);
    }
    // projectionKey excludes timer, scores, chat and other unrelated updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, failed, projectionKey, revealComplete, roomCode, animateDeal]);

  useEffect(() => {
    const scene = sceneRef.current;
    const parent = mount.current;
    const current = latestGame.current;
    if (!ready || failed || !scene || !parent || !current) return;
    startMeldFlights(scene, parent, current, meldFlights, (id) => meldCallback.current?.(id));
  }, [ready, failed, meldFlights]);

  const fallback =
    game ??
    (deal
      ? {
          seats: deal.seats,
          seat: 0,
          roundNumber: 0,
          revision: 0,
          stockCount: deal.stock.length,
          packetCounts: deal.packets.map((packet) => packet.length),
          handCounts: deal.hands.map((hand) => hand.length),
          discards: deal.discard,
        }
      : null);

  return (
    <div
      ref={mount}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 24 }}
      role="img"
      aria-label="Τραπέζι Μπιρίμπας με ζώνες ομάδων, κεντρικές στοίβες και φύλλα"
    >
      {failed &&
        fallback &&
        biribaVisualCards(fallback).map((card) => (
          <img
            key={card.id}
            src={card.artwork}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: `${card.x / 12.8}%`,
              top: `${card.y / 7.2}%`,
              width: `${card.width / 12.8}%`,
              height: `${card.height / 7.2}%`,
              transform: `${card.id.startsWith("fan:") ? "translate(-50%, -50%) " : ""}rotate(${card.angle}deg)`,
            }}
          />
        ))}
    </div>
  );
}
