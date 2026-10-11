/** Stable deterministic heap coordinates, shared by flights and landed cards. */
export function discardLanding(index: number) {
  // Independent mixed values avoid the diagonal rows/parallel angles produced by
  // modular increments. Stable card indices also keep earlier landings unchanged.
  const scatter = (salt: number, radius: number) => {
    let value = (index + salt) | 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return Math.round((((value >>> 0) / 4294967296) * 2 - 1) * radius);
  };
  return {
    x: scatter(107, 20),
    y: scatter(211, 13),
    angle: scatter(307, 38),
  };
}
export type DiscardSnapshot = {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  dx: number;
  dy: number;
  scale: number;
  angle: number;
  face: Node;
};
export function discardFrames(card: DiscardSnapshot) {
  const pose = (x: number, y: number, rotation: number, scale: number) =>
    `translate3d(${x}px,${y}px,0) rotate(${rotation}deg) scale(${scale})`;
  return [
    { offset: 0, transform: pose(0, 0, card.rotation, 1), easing: "ease-in" },
    {
      offset: 0.25,
      transform: pose(card.dx * 0.035, card.dy * 0.035, card.rotation + 3, 1),
      easing: "cubic-bezier(.4,0,.2,1)",
    },
    {
      offset: 0.6,
      transform: pose(
        card.dx * 0.56,
        card.dy * 0.56 - Math.min(30, Math.abs(card.dx) * 0.09),
        card.angle * 0.6,
        1 + (card.scale - 1) * 0.5,
      ),
      easing: "cubic-bezier(.2,.7,.2,1)",
    },
    { offset: 1, transform: pose(card.dx, card.dy, card.angle, card.scale) },
  ];
}
