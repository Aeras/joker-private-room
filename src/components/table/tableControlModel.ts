import type { TableGeometry } from "./useTableGeometry";

export function declarationDisplayValue(value: number): string {
  return value === 0 ? "—" : String(value);
}

export function declarationAccessibleLabel(value: number): string {
  return value === 0 ? "Πάσο / δήλωση μηδέν" : `Δήλωση ${value}`;
}

/** Offset from the symmetric felt center to the measured usable hand-lane center. */
export function localHandCenterOffset(geometry: TableGeometry | null): number {
  if (!geometry) return 0;
  return geometry.localHandCenter.x - geometry.feltRect.width / 2;
}
