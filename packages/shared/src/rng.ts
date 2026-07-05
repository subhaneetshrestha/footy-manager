/**
 * The single injected seedable PRNG (contract §3.9).
 * xoshiro128** seeded via splitmix32 — 32-bit integer ops only (Math.imul,
 * shifts), so sequences are byte-identical on every host/JS engine.
 *
 * Engine rules: no Math.random, no Date, no unordered Map/Set iteration.
 * All randomness flows through an injected Rng.
 */

export interface Rng {
  /** Next uniform uint32. */
  nextUint32(): number;
  /** Next uniform float in [0, 1). Derived as uint32 × 2⁻³² — deterministic. */
  nextFloat(): number;
  /** Uniform integer in [minIncl, maxIncl]. */
  nextInt(minIncl: number, maxIncl: number): number;
  /**
   * Derive an independent child stream. Pure: same (construction seed, streamId)
   * always yields the same stream; does not advance this generator.
   */
  fork(streamId: number): Rng;
}

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

class Xoshiro128StarStar implements Rng {
  private readonly seed: number;
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const sm = splitmix32(this.seed);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
    // All-zero state is invalid for xoshiro; splitmix output makes this
    // astronomically unlikely, but guard anyway.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s3 = 1;
  }

  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  nextFloat(): number {
    return this.nextUint32() * 2 ** -32;
  }

  nextInt(minIncl: number, maxIncl: number): number {
    return minIncl + Math.floor(this.nextFloat() * (maxIncl - minIncl + 1));
  }

  fork(streamId: number): Rng {
    return new Xoshiro128StarStar(deriveSeed(this.seed, streamId));
  }
}

export function createRng(seed: number): Rng {
  return new Xoshiro128StarStar(seed);
}

/**
 * Deterministically mix a master seed with stream ids for hierarchical seeding
 * (world → season → matchday → match).
 */
export function deriveSeed(masterSeed: number, ...streamIds: number[]): number {
  let h = masterSeed >>> 0;
  for (const id of streamIds) {
    h = (h ^ Math.imul(id | 0, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h;
}
