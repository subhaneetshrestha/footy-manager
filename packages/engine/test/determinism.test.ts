import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeGolden, type GoldenSnapshot } from './battery';

function loadGolden(): GoldenSnapshot {
  try {
    return JSON.parse(
      readFileSync(new URL('./golden.json', import.meta.url), 'utf8'),
    ) as GoldenSnapshot;
  } catch {
    throw new Error(
      'test/golden.json missing — generate it once with: pnpm --filter @footy/engine golden',
    );
  }
}

describe('CI determinism gate (contract §3.9 — hard merge gate)', () => {
  it('battery output is byte-identical to the committed golden snapshot', () => {
    const golden = loadGolden();
    const computed = computeGolden();
    expect(computed.prng).toBe(golden.prng);
    expect(computed.match).toBe(golden.match);
    expect(computed.valuation).toBe(golden.valuation);
  });

  it('battery is repeatable within one process', () => {
    expect(computeGolden()).toEqual(computeGolden());
  });
});
