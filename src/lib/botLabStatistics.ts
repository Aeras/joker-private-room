/** Histogram quantiles are intervals; do not invent exact p95/p99 timings. */
export function latencyInterval(histogram: number[], bounds: number[], q: number): string {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (!total) return "—";
  const target = Math.ceil(total * q);
  let count = 0;
  for (let i = 0; i < histogram.length; i++) {
    count += histogram[i]!;
    if (count >= target)
      return i >= bounds.length
        ? `>${bounds.at(-1)} ms`
        : `${i === 0 ? 0 : bounds[i - 1]}–${bounds[i]} ms`;
  }
  return "—";
}
