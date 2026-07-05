/**
 * Statistical quality gates for the single injected PRNG (contract §3.9).
 * Tolerances are multiple sigmas wide — failures mean real defects, not noise.
 */

import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../src/index';

const N = 100_000;

describe('PRNG statistical quality', () => {
  it('floats are uniform across 16 buckets', () => {
    const rng = createRng(0xbeef);
    const buckets = new Array<number>(16).fill(0);
    for (let i = 0; i < N; i++) {
      const idx = Math.floor(rng.nextFloat() * 16);
      buckets[idx] = (buckets[idx] ?? 0) + 1;
    }
    const expected = N / 16;
    for (const count of buckets) {
      expect(Math.abs(count - expected)).toBeLessThan(expected * 0.06);
    }
  });

  it('float mean ≈ 0.5 and variance ≈ 1/12', () => {
    const rng = createRng(0xcafe);
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const u = rng.nextFloat();
      sum += u;
      sumSq += u * u;
    }
    const mean = sum / N;
    const variance = sumSq / N - mean * mean;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.005);
    expect(Math.abs(variance - 1 / 12)).toBeLessThan(0.003);
  });

  it('successive draws are serially uncorrelated', () => {
    const rng = createRng(0xdead);
    let prev = rng.nextFloat();
    let sumProduct = 0;
    for (let i = 0; i < N; i++) {
      const next = rng.nextFloat();
      sumProduct += prev * next;
      prev = next;
    }
    // E[u_i · u_{i+1}] = 0.25 for independent uniforms.
    expect(Math.abs(sumProduct / N - 0.25)).toBeLessThan(0.01);
  });

  it('fork streams are uncorrelated with the parent', () => {
    const parent = createRng(0xf00d);
    const fork = createRng(0xf00d).fork(1);
    const n = 10_000;
    let sumA = 0;
    let sumB = 0;
    let sumAB = 0;
    let sumA2 = 0;
    let sumB2 = 0;
    for (let i = 0; i < n; i++) {
      const a = parent.nextFloat();
      const b = fork.nextFloat();
      sumA += a;
      sumB += b;
      sumAB += a * b;
      sumA2 += a * a;
      sumB2 += b * b;
    }
    const cov = sumAB / n - (sumA / n) * (sumB / n);
    const varA = sumA2 / n - (sumA / n) ** 2;
    const varB = sumB2 / n - (sumB / n) ** 2;
    const pearson = cov / Math.sqrt(varA * varB);
    expect(Math.abs(pearson)).toBeLessThan(0.05);
  });

  it('uint32 bits are balanced', () => {
    const rng = createRng(0xace);
    let setBits = 0;
    const draws = 10_000;
    for (let i = 0; i < draws; i++) {
      let v = rng.nextUint32();
      while (v !== 0) {
        setBits += v & 1;
        v >>>= 1;
      }
    }
    const expected = draws * 16;
    expect(Math.abs(setBits - expected)).toBeLessThan(expected * 0.02);
  });

  it('nextInt covers every value of small ranges and respects arbitrary bounds', () => {
    const rng = createRng(0x1234);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.nextInt(0, 3));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);

    for (let trial = 0; trial < 2000; trial++) {
      const min = rng.nextInt(-50, 50);
      const max = min + rng.nextInt(0, 100);
      const v = rng.nextInt(min, max);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('deriveSeed spreads across stream ids without collisions in a realistic range', () => {
    const seeds = new Set<number>();
    for (let id = 0; id < 10_000; id++) seeds.add(deriveSeed(0x20260701, id));
    expect(seeds.size).toBe(10_000);
  });
});
