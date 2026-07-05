/**
 * Pure Gregorian date math (Howard Hinnant's civil-days algorithms).
 * Integer-only: keeps the seed build deterministic with no Date/timezone use.
 */

export function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z: number): { y: number; m: number; d: number } {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

export function isoDate(y: number, m: number, d: number): string {
  const mm = m < 10 ? `0${m}` : String(m);
  const dd = d < 10 ? `0${d}` : String(d);
  return `${y}-${mm}-${dd}`;
}

export function subtractDaysIso(y: number, m: number, d: number, days: number): string {
  const civil = civilFromDays(daysFromCivil(y, m, d) - days);
  return isoDate(civil.y, civil.m, civil.d);
}
