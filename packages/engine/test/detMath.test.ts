import { describe, expect, it } from 'vitest';
import { detExp, fnv1a64, interpolate, powInt } from '../src/index';

describe('fnv1a64', () => {
  it('matches the published FNV-1a 64-bit test vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('is sensitive to order and content', () => {
    expect(fnv1a64('1-0;2-1')).not.toBe(fnv1a64('2-1;1-0'));
    expect(fnv1a64('abc')).not.toBe(fnv1a64('abd'));
  });
});

describe('powInt', () => {
  it('matches Math.pow for integer exponents', () => {
    for (const base of [0.5, 0.9, 1.09, 1.13, 1.18, 2]) {
      for (let exp = -10; exp <= 10; exp++) {
        const expected = Math.pow(base, exp); // allowed in tests
        expect(Math.abs(powInt(base, exp) - expected) / Math.abs(expected)).toBeLessThan(1e-12);
      }
    }
  });

  it('handles the zero exponent and truncates fractional exponents', () => {
    expect(powInt(1.18, 0)).toBe(1);
    expect(powInt(2, 3.9)).toBe(8);
    expect(powInt(2, -2.9)).toBe(0.25);
  });
});

describe('interpolate', () => {
  const curve = [
    [0, 10],
    [10, 20],
    [20, 0],
  ] as const;

  it('is exact at knots and linear between them', () => {
    expect(interpolate(curve, 0)).toBe(10);
    expect(interpolate(curve, 10)).toBe(20);
    expect(interpolate(curve, 20)).toBe(0);
    expect(interpolate(curve, 5)).toBe(15);
    expect(interpolate(curve, 15)).toBe(10);
  });

  it('clamps outside the domain', () => {
    expect(interpolate(curve, -100)).toBe(10);
    expect(interpolate(curve, 100)).toBe(0);
  });

  it('rejects an empty curve', () => {
    expect(() => interpolate([], 1)).toThrow();
  });
});

describe('detExp', () => {
  it('agrees with Math.exp to double precision across the working range', () => {
    for (let x = -30; x <= 30; x += 0.1) {
      const expected = Math.exp(x); // allowed in tests
      expect(Math.abs(detExp(x) - expected) / expected).toBeLessThan(1e-12);
    }
  });

  it('handles identities and extremes', () => {
    expect(detExp(0)).toBe(1);
    expect(detExp(1)).toBeCloseTo(2.718281828459045, 15);
    expect(detExp(710)).toBe(Infinity);
    expect(detExp(-745)).toBe(0);
  });

  it('is strictly increasing', () => {
    let prev = detExp(-20);
    for (let x = -19.5; x <= 20; x += 0.5) {
      const v = detExp(x);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
