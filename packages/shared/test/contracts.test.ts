import { describe, expect, it } from 'vitest';
import {
  ALL_ATTRIBUTES,
  GK_ATTRIBUTES,
  OVR_COEFFICIENTS,
  PLAY_STYLES,
  PLAY_STYLE_PARAMS,
  POSITIONS,
  computeOvr,
  createRng,
  deriveSeed,
  paceOf,
} from '../src/index';

describe('OVR coefficient tables (contract §5)', () => {
  it('weights sum to 1 for every position', () => {
    for (const pos of POSITIONS) {
      const coeffs = OVR_COEFFICIENTS[pos];
      let sum = 0;
      for (const key in coeffs) sum += coeffs[key as keyof typeof coeffs] ?? 0;
      expect(sum, `position ${pos}`).toBeCloseTo(1, 9);
    }
  });

  it('only references attributes from the locked vocabulary', () => {
    const known = new Set<string>(ALL_ATTRIBUTES);
    for (const pos of POSITIONS) {
      for (const attr of Object.keys(OVR_COEFFICIENTS[pos])) {
        expect(known.has(attr), `${pos}.${attr}`).toBe(true);
      }
    }
  });

  it('computeOvr is bounded 0-99 and monotone in inputs', () => {
    const all99 = Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, 99]));
    const all50 = Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, 50]));
    const all0 = Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, 0]));
    for (const pos of POSITIONS) {
      expect(computeOvr(pos, all99)).toBe(99);
      expect(computeOvr(pos, all50)).toBe(50);
      expect(computeOvr(pos, all0)).toBe(0);
    }
  });

  it('GK overall is driven by the fixed GK set', () => {
    const eliteGk = Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, 40])) as Record<
      string,
      number
    >;
    for (const gkAttr of GK_ATTRIBUTES) eliteGk[gkAttr] = 95;
    expect(computeOvr('GK', eliteGk)).toBeGreaterThan(80);
    expect(computeOvr('ST', eliteGk)).toBeLessThan(45);
  });
});

describe('reconciled constants (contract §3.8)', () => {
  it('pace formula matches the locked weights', () => {
    expect(paceOf(80, 80)).toBe(80);
    expect(paceOf(60, 90)).toBe(Math.round(0.45 * 60 + 0.55 * 90));
  });

  it('all play styles have complete parameter bundles', () => {
    for (const style of PLAY_STYLES) {
      const p = PLAY_STYLE_PARAMS[style];
      expect(p.tempo).toBeGreaterThanOrEqual(0);
      expect(p.tempo).toBeLessThanOrEqual(100);
      expect(p.compactness).toBeGreaterThanOrEqual(0);
      expect(p.compactness).toBeLessThanOrEqual(100);
    }
  });
});

describe('seedable PRNG (contract §3.9)', () => {
  it('same seed -> identical sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it('different seeds -> different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 8 }, () => a.nextUint32());
    const seqB = Array.from({ length: 8 }, () => b.nextUint32());
    expect(seqA).not.toEqual(seqB);
  });

  it('fork is pure: same streamId -> same stream, parent unaffected', () => {
    const parent = createRng(7);
    const before = createRng(7).nextUint32();
    const f1 = parent.fork(3).nextUint32();
    const f2 = parent.fork(3).nextUint32();
    const f3 = parent.fork(4).nextUint32();
    expect(f1).toBe(f2);
    expect(f1).not.toBe(f3);
    expect(parent.nextUint32()).toBe(before);
  });

  it('nextFloat in [0,1), nextInt within bounds', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.nextInt(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it('deriveSeed is order-sensitive and stable', () => {
    expect(deriveSeed(123, 1, 2)).toBe(deriveSeed(123, 1, 2));
    expect(deriveSeed(123, 1, 2)).not.toBe(deriveSeed(123, 2, 1));
  });
});
