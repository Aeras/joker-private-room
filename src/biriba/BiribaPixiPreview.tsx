import type { BiribaDealtPreview } from "./localDeal";
import type { BiribaGameView } from "@/services/biribaFunctions";
import { biribaMeldBonus, biribaCardPoints, biribaTeamOf } from "./rules";
import { useEffect, useRef } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import {
  NORMAL_DEAL_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_TRAVEL_MS,
} from "@/components/table/presentationTiming";
import { dealtCardPose, dealProgress } from "@/components/table/dealtCardMotion";
import { BIRIBA_CARD_BACK_WIDTH, BIRIBA_CARD_BACK_HEIGHT, opponentFanPose } from "./tableLayout";

export const BIRIBA_DEAL_BEAT_MS = 110;

export function BiribaPixiPreview({
  deal,
  game,
  redTeam = 0,
  revealComplete = false,
  onDealComplete,
}: {
  deal?: BiribaDealtPreview | undefined;
  game?: BiribaGameView | undefined;
  redTeam?: number;
  revealComplete?: boolean | undefined;
  onDealComplete?: ((key: string) => void) | undefined;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const lastDealtRound = useRef<string | null>(null);

  useEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    let disposed = false;
    let app: Application | undefined;
    const dealTimers: Array<ReturnType<typeof setTimeout>> = [];
    const schedule = (callback: () => void, delay: number) => {
      dealTimers.push(setTimeout(callback, delay));
    };
    const dealKey = game ? `${game.roundNumber}:${game.seat}` : null;
    const dealEntrance = dealKey !== null && lastDealtRound.current !== dealKey;
    if (dealEntrance) lastDealtRound.current = dealKey;

    void (async () => {
      const pixi = new Application();
      await pixi.init({
        resizeTo: parent,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        pixi.destroy(true);
        return;
      }
      app = pixi;
      parent.appendChild(pixi.canvas);
      const stage = new Container();
      pixi.stage.addChild(stage);
      const w = 1280,
        h = 720;

      const contentScale = Math.min(parent.clientWidth / w, parent.clientHeight / h);
      const gutter = Math.max(0, (parent.clientWidth - w * contentScale) / (2 * contentScale));
      const leftEdge = -gutter + 8;
      const rightEdge = w + gutter - 38;

      const resize = () => {
        stage.scale.set(parent.clientWidth / w, parent.clientHeight / h);
        stage.position.set(0, 0);
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(parent);

      const suitIcon: Record<string, string> = {
        spades: "♠",
        hearts: "♥",
        diamonds: "♦",
        clubs: "♣",
      };
      const fileRank = (rank: string) =>
        (({ A: "ace", K: "king", Q: "queen", J: "jack" }) as Record<string, string>)[rank] || rank;
      type Face = { rank: string; suit: string };
      const face = (rank: string, suit: string): Face => ({ rank, suit });

      const addCard = async (
        c: Face | null,
        x: number,
        y: number,
        scale = 1,
        delay = 0,
        from?: [number, number],
      ) => {
        const path = c
          ? c.rank === "JOKER"
            ? "/cards/optimized-png/faces/joker_red.png"
            : `/cards/optimized-png/faces/${c.suit}_${fileRank(c.rank)}.png`
          : "/cards/optimized-png/backs/blue_back.png";
        try {
          const texture = await Assets.load(path);
          if (disposed) return;
          const sprite = new Sprite(texture);
          sprite.width = 58 * scale;
          sprite.height = 85 * scale;
          sprite.position.set(from?.[0] ?? x, from?.[1] ?? y + 12);
          sprite.alpha = from ? 1 : 0;
          stage.addChild(sprite);
          let progress = 0;
          const animate = (ticker: { deltaMS: number }) => {
            progress += ticker.deltaMS / (from ? NORMAL_DEAL_TRAVEL_MS : 180);
            const t = Math.min(1, progress),
              eased = 1 - Math.pow(1 - t, 3);
            sprite.x = from ? from[0] + (x - from[0]) * eased : x;
            sprite.y = from ? from[1] + (y - from[1]) * eased : y + 12 * (1 - eased);
            sprite.alpha = from ? 1 : eased;
            if (t === 1) pixi.ticker.remove(animate);
          };
          if (delay) await new Promise((r) => setTimeout(r, delay));
          if (!disposed) pixi.ticker.add(animate);
        } catch {
          if (disposed) return;
          const g = new Graphics()
            .roundRect(x, y, 58 * scale, 85 * scale, 8)
            .fill({ color: c ? 0xfafafa : 0x1e3a8a });
          g.roundRect(x, y, 58 * scale, 85 * scale, 8).stroke({
            color: c ? 0xd4af37 : 0x93c5fd,
            width: 2,
          });
          stage.addChild(g);
          if (c) {
            const t = new Text({
              text: c.rank + (suitIcon[c.suit] ?? ""),
              style: {
                fontSize: 16 * scale,
                fill: c.suit === "hearts" || c.suit === "diamonds" ? "#dc2626" : "#171717",
                fontWeight: "bold",
              },
            });
            t.position.set(x + 6 * scale, y + 6 * scale);
            stage.addChild(t);
          }
        }
      };

      const set = (cards: Face[], x: number, y: number) =>
        cards.forEach((c, i) => void addCard(c, x + i * 22, y, 0.76, i * 20));

      // 1. Render Melds in Left (Red) and Right (Blue) zones
      if (game) {
        const visual = (card: { joker?: boolean; rank?: number; suit?: string }): Face =>
          card.joker
            ? face("JOKER", "joker")
            : face(
                ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[card.rank ?? 0] ??
                  String(card.rank ?? ""),
                card.suit ?? "spades",
              );
        const onTeam = (team: number) =>
          game.melds.filter((m) => biribaTeamOf(m.ownerSeat, game.seats) === team);
        for (const [zone, team] of [
          [0, redTeam],
          [1, 1 - redTeam],
        ] as [number, number][]) {
          const melds = onTeam(team);
          melds.forEach((meld, i) => {
            const x = zone === 0 ? 215 : 715;
            const y = 175 + Math.floor(i / 3) * 78;
            const offset = (i % 3) * 120;
            meld.cards.forEach(
              (p, index) =>
                void addCard(visual(p.card), x + offset + index * 22, y, 0.76, index * 12),
            );
          });
        }
      } else {
        // Reference demonstration melds matching the screenshot
        set([face("7", "hearts"), face("8", "hearts"), face("9", "hearts")], 215, 175);
        set([face("J", "spades"), face("Q", "spades"), face("K", "spades")], 330, 175);
        set([face("4", "clubs"), face("5", "clubs"), face("6", "clubs")], 445, 175);
        set(
          [
            face("10", "diamonds"),
            face("J", "diamonds"),
            face("Q", "diamonds"),
            face("K", "diamonds"),
          ],
          270,
          250,
        );

        set([face("A", "spades"), face("2", "spades"), face("3", "spades")], 715, 175);
        set([face("9", "hearts"), face("10", "hearts"), face("J", "hearts")], 830, 175);
        set([face("7", "clubs"), face("8", "clubs"), face("9", "clubs")], 945, 175);
        set([face("K", "hearts"), face("K", "diamonds"), face("K", "clubs")], 760, 250);
        set(
          [
            face("5", "diamonds"),
            face("6", "diamonds"),
            face("7", "diamonds"),
            face("8", "diamonds"),
          ],
          900,
          250,
        );
      }

      // Public piles follow the authorized projection. An empty pile stays empty.
      const discard = game?.discards.at(-1) ?? deal?.discard.at(-1);
      const discardTop = discard
        ? discard.joker
          ? face("JOKER", "joker")
          : face(
              ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[discard.rank] ??
                String(discard.rank),
              discard.suit,
            )
        : null;
      const backStack = (x: number, y: number, layers: number) => {
        for (let i = 0; i < layers; i++) void addCard(null, x + i * 2, y - i * 2, 1.18);
      };
      if (!game || game.stockCount > 0)
        backStack(440, 337, game ? Math.min(3, game.stockCount) : 3);
      if (discardTop) void addCard(discardTop, 548, 337, 1.18);
      if (!game || (game.packetCounts[0] ?? 0) > 0) backStack(664, 337, 2);
      if (!game || (game.packetCounts[1] ?? 0) > 0) backStack(766, 337, 2);

      // The projection exposes the trump suit, not the identity of a trump card.
      const trumpSuit = game?.trump ?? deal?.trump;
      if (trumpSuit) {
        const trumpSurface = new Graphics()
          .roundRect(609, 470, 55, 48, 5)
          .fill({ color: 0xfffcf4 })
          .stroke({ color: 0xc9b98b, width: 1 });
        stage.addChild(trumpSurface);
        const trumpSymbol = new Text({
          text: suitIcon[trumpSuit] ?? "",
          style: {
            fontSize: 34,
            fill: trumpSuit === "hearts" || trumpSuit === "diamonds" ? "#d81926" : "#111111",
            fontWeight: "bold",
          },
        });
        trumpSymbol.anchor.set(0.5);
        trumpSymbol.position.set(636, 494);
        stage.addChild(trumpSymbol);
      }

      // Opponents keep horizontal card backs in arced fans along the table rim.
      const BACK_W = BIRIBA_CARD_BACK_WIDTH,
        BACK_H = BIRIBA_CARD_BACK_HEIGHT;
      const rear = async (side: "top" | "left" | "right", count: number) => {
        const shown = Math.max(0, Math.min(count, 14));
        if (!shown) return;
        try {
          const texture = await Assets.load("/cards/optimized-png/backs/blue_back.png");
          if (disposed) return;
          for (let i = 0; i < shown; i++) {
            const pose = opponentFanPose(side, i, shown);
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = side === "top" ? 58 : 75;
            sprite.height = side === "top" ? 82 : 105;
            sprite.position.set(pose.x, pose.y);
            sprite.rotation = (pose.angle * Math.PI) / 180;
            stage.addChild(sprite);
          }
        } catch {
          // A missing artwork asset should not break the rest of the table.
        }
      };

      const topSeat = game?.seats === 2 ? 1 : 2;
      const target = (delta: number, index: number): { x: number; y: number; angle: number } => {
        if (delta === 0) return { x: 640 + (index - 5) * 10, y: 665, angle: 0 };
        if (delta === topSeat) return opponentFanPose("top", index, 11);
        if (delta === 1) return opponentFanPose("left", index, 11);
        return opponentFanPose("right", index, 11);
      };
      if (game && dealEntrance && dealKey) {
        const order = game.seats === 4 ? [0, 1, 2, 3] : [0, 1];
        const flightCount = 11 * order.length;
        const allCards: Array<{
          sprite: Sprite;
          delta: number;
          end: { x: number; y: number; angle: number };
        }> = [];
        const texture = await Assets.load("/cards/optimized-png/backs/blue_back.png");
        if (disposed) return;
        const entranceLayer = new Container();
        stage.addChild(entranceLayer);
        for (let i = 0; i < 11; i++)
          for (const delta of order) {
            const end = target(delta, i);
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = BACK_W;
            sprite.height = BACK_H;
            sprite.position.set(474, 380);
            sprite.alpha = 0;
            entranceLayer.addChild(sprite);
            allCards.push({ sprite, delta, end });
            const destination = { x: end.x, y: end.y };
            const from = { x: 474, y: 380 };
            schedule(
              () => {
                if (disposed) return;
                let elapsed = 0;
                sprite.alpha = 1;
                const tick = (ticker: { deltaMS: number }) => {
                  elapsed += ticker.deltaMS;
                  const p = dealProgress(Math.min(1, elapsed / NORMAL_DEAL_TRAVEL_MS));
                  const pose = dealtCardPose(from, destination, 0, end.angle, p);
                  sprite.position.set(pose.point.x, pose.point.y);
                  sprite.rotation = (pose.rotation * Math.PI) / 180;
                  sprite.width = BACK_W * pose.scale;
                  sprite.height = BACK_H * pose.scale;
                  if (elapsed >= NORMAL_DEAL_TRAVEL_MS) pixi.ticker.remove(tick);
                };
                pixi.ticker.add(tick);
              },
              (i * order.length + delta) * BIRIBA_DEAL_BEAT_MS,
            );
          }
        const flightEnd = (flightCount - 1) * BIRIBA_DEAL_BEAT_MS + NORMAL_DEAL_TRAVEL_MS;
        schedule(() => {
          if (disposed) return;
          const original = allCards.map(({ sprite }) => ({ x: sprite.x, y: sprite.y }));
          let elapsed = 0;
          const handoff = (ticker: { deltaMS: number }) => {
            elapsed += ticker.deltaMS;
            const t = Math.min(1, elapsed / NORMAL_DEAL_HANDOFF_TRAVEL_MS);
            allCards.forEach(({ sprite, delta }, index) => {
              const start = original[index]!;
              const exit =
                delta === 0
                  ? { x: start.x, y: 780 }
                  : delta === topSeat
                    ? { x: start.x, y: -150 }
                    : delta === 1
                      ? { x: leftEdge - 180, y: start.y }
                      : { x: rightEdge + 180, y: start.y };
              sprite.position.set(
                start.x + (exit.x - start.x) * t,
                start.y + (exit.y - start.y) * t,
              );
              sprite.alpha = t < 0.65 ? 1 : (1 - t) / 0.35;
            });
            if (t >= 1) {
              pixi.ticker.remove(handoff);
              entranceLayer.destroy({ children: true });
            }
          };
          pixi.ticker.add(handoff);
        }, flightEnd + 90);
        schedule(
          () => {
            if (!disposed) onDealComplete?.(dealKey);
          },
          flightEnd + NORMAL_DEAL_HANDOFF_TRAVEL_MS + 100,
        );
      } else {
        void rear("top", game ? (game.handCounts[(game.seat + topSeat) % game.seats] ?? 0) : 11);
        if (!game || game.seats === 4) {
          void rear("left", game ? (game.handCounts[(game.seat + 1) % game.seats] ?? 0) : 11);
          void rear("right", game ? (game.handCounts[(game.seat + 3) % game.seats] ?? 0) : 11);
        }
      }

      (pixi as Application & { __biribaObserver?: ResizeObserver }).__biribaObserver = observer;
    })();

    return () => {
      disposed = true;
      for (const timer of dealTimers) clearTimeout(timer);
      if (app) {
        (app as Application & { __biribaObserver?: ResizeObserver }).__biribaObserver?.disconnect();
        app.destroy(true, { children: true });
      }
    };
  }, [deal, game, redTeam, revealComplete, onDealComplete]);

  return (
    <div
      ref={mount}
      className="absolute inset-0 pointer-events-none"
      role="img"
      aria-label="Τραπέζι Μπιρίμπας με ζώνες ομάδων, κεντρικές στοίβες και φύλλα"
    />
  );
}
