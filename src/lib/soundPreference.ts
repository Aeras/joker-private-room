export const SOUND_PREFERENCE_KEY = "joker.sound.v1";
let fallback = true;
export function getSoundEnabled(): boolean {
  try {
    return typeof localStorage === "undefined"
      ? fallback
      : localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
  } catch {
    return fallback;
  }
}
export function setSoundEnabled(enabled: boolean): void {
  fallback = enabled;
  try {
    localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    /* Device storage may be blocked. */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("joker:sound"));
}
export function subscribeSoundPreference(callback: () => void): () => void {
  window.addEventListener("joker:sound", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("joker:sound", callback);
    window.removeEventListener("storage", callback);
  };
}
