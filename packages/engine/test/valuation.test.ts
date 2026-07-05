import { describe, expect, it } from 'vitest';
import { playerValue, weeklyWage } from '../src/index';

describe('single valuation function (contract §3.3, requirement #13)', () => {
  it('young high-potential premium: 17yo OVR 68 / POT 90 >> 28yo OVR 68 / POT 68', () => {
    const wonderkid = playerValue({
      ovr: 68,
      potential: 90,
      age: 17,
      contractYearsLeft: 4,
      reputation: 45,
      position: 'RW',
    });
    const journeyman = playerValue({
      ovr: 68,
      potential: 68,
      age: 28,
      contractYearsLeft: 4,
      reputation: 45,
      position: 'RW',
    });
    expect(wonderkid).toBeGreaterThan(journeyman * 2);
  });

  it('peak-age superstar lands in a realistic fee band', () => {
    const star = playerValue({
      ovr: 92,
      potential: 92,
      age: 27,
      contractYearsLeft: 3,
      reputation: 95,
      position: 'ST',
    });
    expect(star).toBeGreaterThan(40_000_000);
    expect(star).toBeLessThan(250_000_000);
  });

  it('expiring contract collapses the fee', () => {
    const base = { ovr: 80, potential: 80, age: 26, reputation: 70, position: 'CM' as const };
    const longDeal = playerValue({ ...base, contractYearsLeft: 3 });
    const expiring = playerValue({ ...base, contractYearsLeft: 0 });
    expect(expiring).toBeLessThan(longDeal * 0.2);
  });

  it('is monotone in OVR', () => {
    let prev = 0;
    for (let ovr = 40; ovr <= 95; ovr += 5) {
      const v = playerValue({
        ovr,
        potential: ovr,
        age: 25,
        contractYearsLeft: 3,
        reputation: ovr,
        position: 'CM',
      });
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('wages are plausible at both ends', () => {
    expect(weeklyWage(90, 90)).toBeGreaterThan(50_000);
    expect(weeklyWage(90, 90)).toBeLessThan(300_000);
    expect(weeklyWage(45, 40)).toBeGreaterThanOrEqual(300);
    expect(weeklyWage(45, 40)).toBeLessThan(3_000);
  });
});
