const completed = new Set<string>();
export function presentationWasCompleted(key: string): boolean {
  if (completed.has(key)) return true;
  try { return typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1"; } catch { return false; }
}
export function markPresentationCompleted(key: string): void {
  completed.add(key);
  while (completed.size > 128) completed.delete(completed.values().next().value!);
  try { window.sessionStorage.setItem(key, "1"); } catch { /* Memory completion remains available. */ }
  window.dispatchEvent(new Event("joker:presentation-completed"));
}
