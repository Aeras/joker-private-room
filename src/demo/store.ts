/**
 * DEMO ONLY. Local session state persisted in sessionStorage.
 * Production replaces this with backend session + realtime room state.
 */
import { useSyncExternalStore } from "react";
import type { PublicPlayer, Room } from "@/domain/players";

export interface DemoState {
  hydrated: boolean;
  localPlayer: PublicPlayer | null;
  room: Room | null;
}

const KEY = "joker-demo-state";
const INITIAL: DemoState = { hydrated: false, localPlayer: null, room: null };
let state: DemoState = INITIAL;
const listeners = new Set<() => void>();

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<DemoState>) : {};
    state = { localPlayer: saved.localPlayer ?? null, room: saved.room ?? null, hydrated: true };
  } catch {
    state = { ...INITIAL, hydrated: true };
  }
  queueMicrotask(() => listeners.forEach((l) => l()));
}

export const demoStore = {
  get: () => state,
  set(update: Partial<Omit<DemoState, "hydrated">>) {
    state = { ...state, ...update, hydrated: true };
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ localPlayer: state.localPlayer, room: state.room }));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    hydrate();
    return () => listeners.delete(l);
  },
};

export function useDemoState() {
  return useSyncExternalStore(demoStore.subscribe, demoStore.get, () => INITIAL);
}
