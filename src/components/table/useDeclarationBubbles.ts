import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerGameProjection } from "@/domain/projection";
import { DECLARATION_BUBBLE_MS } from "./presentationTiming";

interface Bubble { value: number; expiresAt: number }
type Bubbles = Partial<Record<number, Bubble>>;

/** Public declarations only; presentation never delays or advances a turn. */
export function useDeclarationBubbles(projection: PlayerGameProjection, pendingLocal: number | null) {
  const key = `${projection.gameId}:${projection.progression.dealNumber}`;
  const valuesKey = JSON.stringify(projection.declarations.values);
  const previous = useRef({ key, values: [...projection.declarations.values] });
  const [state, setState] = useState<{ key: string; bubbles: Bubbles }>({ key, bubbles: {} });

  useLayoutEffect(() => {
    const values = JSON.parse(valuesKey) as (number | null)[];
    if (pendingLocal != null) values[projection.viewerSeat] = pendingLocal;
    if (previous.current.key !== key) {
      // Reconnect/new deal does not replay declarations from the initial snapshot.
      previous.current = { key, values };
      setState({ key, bubbles: {} });
      return;
    }
    const changes = values.flatMap((value, seat) => previous.current.values[seat] !== value ? [{ seat, value }] : []);
    previous.current = { key, values };
    if (!changes.length) return;
    setState(current => {
      const bubbles = { ...(current.key === key ? current.bubbles : {}) };
      for (const { seat, value } of changes) {
        if (value == null) delete bubbles[seat]; // Rejected optimistic declaration.
        else bubbles[seat] = { value, expiresAt: Date.now() + DECLARATION_BUBBLE_MS };
      }
      return { key, bubbles };
    });
  }, [key, valuesKey, pendingLocal, projection.viewerSeat]);

  useEffect(() => {
    const expiries = Object.values(state.bubbles).map(bubble => bubble!.expiresAt);
    if (!expiries.length) return;
    const timer = window.setTimeout(() => {
      setState(current => ({ ...current, bubbles: Object.fromEntries(
        Object.entries(current.bubbles).filter(([, bubble]) => bubble!.expiresAt > Date.now()),
      ) }));
    }, Math.max(0, Math.min(...expiries) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [state]);

  return state.key === key ? state.bubbles : {};
}
