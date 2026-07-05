/**
 * Deterministic math for engine hot paths (contract §3.9).
 *
 * Basic IEEE-754 double ops (+ - * /) are correctly rounded and identical on
 * every host/JS engine; libm transcendentals (Math.exp, Math.log, Math.pow
 * with fractional exponents) are NOT. So the engine implements its own using
 * only basic ops.
 */

const E = 2.718281828459045; // closest double to e

/**
 * Deterministic exp(x). Integer part by repeated multiplication of the double
 * literal E; fractional part by a fixed-length Taylor series. |x| <= ~700.
 */
export function detExp(x: number): number {
  if (x === 0) return 1;
  if (x < 0) return 1 / detExp(-x);
  if (x > 709) return Infinity;
  const n = Math.floor(x);
  const r = x - n;
  let intPart = 1;
  for (let i = 0; i < n; i++) intPart *= E;
  // Taylor for exp(r), r in [0,1): 20 terms exceed double precision.
  let term = 1;
  let sum = 1;
  for (let i = 1; i <= 20; i++) {
    term = (term * r) / i;
    sum += term;
  }
  return intPart * sum;
}

/** Deterministic base^exp for INTEGER exponents (repeated multiplication). */
export function powInt(base: number, exp: number): number {
  let e = Math.trunc(exp);
  const invert = e < 0;
  if (invert) e = -e;
  let result = 1;
  for (let i = 0; i < e; i++) result *= base;
  return invert ? 1 / result : result;
}

/** Piecewise-linear interpolation over sorted [x, y] points; clamps at the ends. */
export function interpolate(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) throw new Error('empty curve');
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (p0 !== undefined && p1 !== undefined && x <= p1[0]) {
      const t = (x - p0[0]) / (p1[0] - p0[0]);
      return p0[1] + t * (p1[1] - p0[1]);
    }
  }
  return last[1];
}

/** FNV-1a 64-bit hash of a string, as fixed-width hex. For golden/differential tests. */
export function fnv1a64(input: string): string {
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}
