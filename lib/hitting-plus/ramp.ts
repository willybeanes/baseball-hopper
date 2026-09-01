/**
 * Percentile-driven colour ramp, matching the house style: steel blue below
 * average, a neutral warm grey at the midpoint, rust red above average.
 */
export function ramp(p: number | null | undefined): string {
  if (p == null) return "var(--dimmer)";
  if (p < 50) {
    const mix = Math.min(100, ((50 - p) / 50) * 100);
    return `color-mix(in oklab, var(--cool) ${mix}%, var(--neutral-bar))`;
  }
  const mix = Math.min(100, ((p - 50) / 50) * 100);
  return `color-mix(in oklab, var(--accent) ${mix}%, var(--neutral-bar))`;
}
