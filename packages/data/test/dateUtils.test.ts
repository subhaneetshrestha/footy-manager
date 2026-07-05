import { createRng } from '@footy/shared';
import { describe, expect, it } from 'vitest';
import {
  civilFromDays,
  daysFromCivil,
  isoDate,
  subtractDaysIso,
} from '../src/generate/dateUtils';

describe('pure Gregorian date math', () => {
  it('anchors to the Unix epoch', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(civilFromDays(0)).toEqual({ y: 1970, m: 1, d: 1 });
  });

  it('agrees with Date.UTC across 1900-2100 (fuzz)', () => {
    const rng = createRng(0xda7e);
    for (let trial = 0; trial < 2_000; trial++) {
      const y = rng.nextInt(1900, 2100);
      const m = rng.nextInt(1, 12);
      const d = rng.nextInt(1, 28);
      const oracle = Date.UTC(y, m - 1, d) / 86_400_000; // Date allowed in tests
      expect(daysFromCivil(y, m, d)).toBe(oracle);
    }
  });

  it('round-trips days ↔ civil (fuzz incl. month ends and leap days)', () => {
    const rng = createRng(0x0dd);
    for (let trial = 0; trial < 5_000; trial++) {
      const z = rng.nextInt(-40_000, 80_000); // ~1860..2189
      const civil = civilFromDays(z);
      expect(daysFromCivil(civil.y, civil.m, civil.d)).toBe(z);
      expect(civil.m).toBeGreaterThanOrEqual(1);
      expect(civil.m).toBeLessThanOrEqual(12);
      expect(civil.d).toBeGreaterThanOrEqual(1);
      expect(civil.d).toBeLessThanOrEqual(31);
    }
  });

  it('handles leap-year rules (2000 leap, 1900 not, 2024 leap)', () => {
    expect(subtractDaysIso(2000, 3, 1, 1)).toBe('2000-02-29');
    expect(subtractDaysIso(1900, 3, 1, 1)).toBe('1900-02-28');
    expect(subtractDaysIso(2024, 3, 1, 1)).toBe('2024-02-29');
    expect(subtractDaysIso(2023, 3, 1, 1)).toBe('2023-02-28');
  });

  it('formats ISO with zero padding', () => {
    expect(isoDate(2026, 7, 5)).toBe('2026-07-05');
    expect(isoDate(999, 12, 31)).toBe('999-12-31');
    expect(subtractDaysIso(2026, 1, 1, 0)).toBe('2026-01-01');
  });
});
