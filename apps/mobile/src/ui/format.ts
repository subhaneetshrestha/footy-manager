/** Display formatting helpers (no locale deps; deterministic output). */

export function formatMoney(eur: number): string {
  if (eur >= 1_000_000_000) return `€${(eur / 1_000_000_000).toFixed(1)}B`;
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M`;
  if (eur >= 1_000) return `€${Math.round(eur / 1_000)}k`;
  return `€${Math.round(eur)}`;
}
