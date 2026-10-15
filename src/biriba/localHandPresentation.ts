/** Selection changes vertical pose only; stacking stays in hand order so neighbors remain tappable. */
export function localHandCardPresentation(index: number, total: number, selected: boolean) {
  const midpoint = (total - 1) / 2;
  const normalized = total > 1 ? (index - midpoint) / midpoint : 0;
  const rotation = normalized * 15;
  const yOffset = normalized ** 2 * 22;
  return {
    transform: `translateY(calc(${yOffset}px - ${selected ? "clamp(45px, 11.5vh, 100px)" : "0px"})) rotate(${rotation}deg)`,
    zIndex: index + 1,
  };
}
