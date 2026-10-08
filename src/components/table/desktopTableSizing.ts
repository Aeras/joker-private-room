/** Desktop-only presentation policy; touch/mobile keeps the existing geometry. */
export const DESKTOP_TABLE_QUERY =
  "(min-width: 1200px) and (min-height: 650px) and (hover: hover) and (pointer: fine)";

export function desktopTableScale(width: number, height: number, desktopPointer: boolean): number {
  if (!desktopPointer || width < 1200 || height < 650) return 1;
  return Math.min(2.25, Math.max(1, Math.min(width / 1200, height / 650)));
}
