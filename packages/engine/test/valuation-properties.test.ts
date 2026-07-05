/**
 * Property sweeps for the single valuation function (contract §3.3):
 * no sweep input may produce a nonsense value, and every economic
 * monotonicity requirement #13 implies must hold.
 */

import { POSITIONS } from '@footy/shared';
import { describe, expect, it } from 'vitest';
import { playerValue, weeklyWage, type PlayerValuationInput } from '../src/index';

function input(overrides: Partial<PlayerValuationInput>): PlayerValuationInput {
  return {
    ovr: 70,
    potential: 70,
    age: 25,
    contractYearsLeft: 3,
    reputation: 60,
    position: 'CM',
    ...overrides,
  };
}

describe('playerValue sweep', () => {
  it('is finite, positive and integer over the full input space', () => {
    for (let ovr = 30; ovr <= 99; ovr += 3) {
      for (let age = 15; age <= 40; age += 1) {
        for (const potGap of [0, 10, 25]) {
          for (const years of [0, 1, 2.5, 4]) {
            const v = playerValue(
              input({
                ovr,
                potential: Math.min(99, ovr + potGap),
                age,
                contractYearsLeft: years,
                reputation: Math.min(99, ovr),
              }),
            );
            expect(Number.isFinite(v)).toBe(true);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThan(0);
            expect(v).toBeLessThan(500_000_000);
          }
        }
      }
    }
  });

  it('is monotone non-decreasing in potential', () => {
    for (const age of [17, 21, 25]) {
      let prev = 0;
      for (let pot = 70; pot <= 99; pot += 3) {
        const v = playerValue(input({ ovr: 70, potential: pot, age }));
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('potential premium fades with age (youthFactor → 0 by 29)', () => {
    const young = playerValue(input({ age: 18, potential: 92, ovr: 72 }));
    const youngFlat = playerValue(input({ age: 18, potential: 72, ovr: 72 }));
    const old = playerValue(input({ age: 31, potential: 92, ovr: 72 }));
    const oldFlat = playerValue(input({ age: 31, potential: 72, ovr: 72 }));
    expect(young / youngFlat).toBeGreaterThan(2);
    expect(old / oldFlat).toBeCloseTo(1, 6);
  });

  it('age curve peaks near 27', () => {
    const at = (age: number) => playerValue(input({ age }));
    expect(at(27)).toBeGreaterThanOrEqual(at(20));
    expect(at(27)).toBeGreaterThanOrEqual(at(33));
    expect(at(33)).toBeGreaterThan(at(37));
  });

  it('is monotone in reputation and in contract years', () => {
    let prev = 0;
    for (let rep = 10; rep <= 99; rep += 10) {
      const v = playerValue(input({ reputation: rep }));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    prev = 0;
    for (const years of [0, 1, 2, 3, 4]) {
      const v = playerValue(input({ contractYearsLeft: years }));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('attacking positions carry a premium over GK for identical profiles', () => {
    const gk = playerValue(input({ position: 'GK' }));
    const st = playerValue(input({ position: 'ST' }));
    expect(st).toBeGreaterThan(gk);
    for (const pos of POSITIONS) {
      expect(playerValue(input({ position: pos }))).toBeGreaterThan(0);
    }
  });
});

describe('weeklyWage sweep', () => {
  it('is monotone in OVR and club reputation, floored, and in 50s', () => {
    let prev = 0;
    for (let ovr = 40; ovr <= 99; ovr += 5) {
      const w = weeklyWage(ovr, 70);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w % 50).toBe(0);
      prev = w;
    }
    for (let rep = 20; rep <= 90; rep += 10) {
      expect(weeklyWage(80, rep + 10)).toBeGreaterThanOrEqual(weeklyWage(80, rep));
    }
    expect(weeklyWage(1, 1)).toBeGreaterThanOrEqual(300);
  });
});
