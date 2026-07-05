/**
 * Deep checks of the locked vocabulary/constants contracts (§3.1, §3.2, §3.6, §3.8).
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_ATTRIBUTES,
  DEFENDING_ATTRIBUTES,
  GK_ATTRIBUTES,
  HIDDEN_ATTRIBUTES,
  INJURY_TIERS,
  INJURY_TIER_DAYS,
  MENTAL_ATTRIBUTES,
  OVR_COEFFICIENTS,
  PHYSICAL_ATTRIBUTES,
  POSITIONS,
  TECHNICAL_ATTRIBUTES,
  clamp,
  computeOvr,
  createRng,
  neutralTacticalProfile,
  paceOf,
  type Attribute,
} from '../src/index';

describe('attribute vocabulary (contract §3.2)', () => {
  it('has exactly 42 attributes (8+13+4+10 outfield, 5 GK, 2 hidden) with no duplicates', () => {
    expect(PHYSICAL_ATTRIBUTES.length).toBe(8);
    expect(TECHNICAL_ATTRIBUTES.length).toBe(13);
    expect(DEFENDING_ATTRIBUTES.length).toBe(4);
    expect(MENTAL_ATTRIBUTES.length).toBe(10);
    expect(GK_ATTRIBUTES.length).toBe(5);
    expect(HIDDEN_ATTRIBUTES.length).toBe(2);
    expect(ALL_ATTRIBUTES.length).toBe(42);
    expect(new Set<string>(ALL_ATTRIBUTES).size).toBe(ALL_ATTRIBUTES.length);
  });

  it('locks the fixed GK set exactly (contract §3.8)', () => {
    expect([...GK_ATTRIBUTES]).toEqual([
      'gk_diving',
      'gk_handling',
      'gk_kicking',
      'gk_positioning',
      'gk_reflexes',
    ]);
  });
});

describe('injury tiers (contract §3.6)', () => {
  it('tier day ranges are ordered and contiguous through severe', () => {
    for (const tier of INJURY_TIERS) {
      const { minDays, maxDays } = INJURY_TIER_DAYS[tier];
      expect(minDays).toBeLessThanOrEqual(maxDays);
    }
    expect(INJURY_TIER_DAYS.minimal.maxDays + 1).toBe(INJURY_TIER_DAYS.mild.minDays);
    expect(INJURY_TIER_DAYS.mild.maxDays + 1).toBe(INJURY_TIER_DAYS.moderate.minDays);
    expect(INJURY_TIER_DAYS.moderate.maxDays + 1).toBe(INJURY_TIER_DAYS.severe.minDays);
  });
});

describe('computeOvr', () => {
  it('matches an independent dot-product oracle on random ratings', () => {
    const rng = createRng(777);
    for (let trial = 0; trial < 200; trial++) {
      const ratings = {} as Record<Attribute, number>;
      for (const attr of ALL_ATTRIBUTES) ratings[attr] = rng.nextInt(0, 99);
      const pos = POSITIONS[rng.nextInt(0, POSITIONS.length - 1)]!;
      let oracle = 0;
      for (const [attr, weight] of Object.entries(OVR_COEFFICIENTS[pos])) {
        oracle += (weight ?? 0) * (ratings[attr as Attribute] ?? 0);
      }
      expect(computeOvr(pos, ratings)).toBe(clamp(Math.round(oracle), 0, 99));
    }
  });

  it('returns 0 for empty ratings and never exceeds 99', () => {
    for (const pos of POSITIONS) {
      expect(computeOvr(pos, {})).toBe(0);
    }
  });
});

describe('reconciled helpers', () => {
  it('paceOf is monotone in both inputs and exact at the ends', () => {
    expect(paceOf(99, 99)).toBe(99);
    expect(paceOf(0, 0)).toBe(0);
    for (let v = 10; v < 90; v += 10) {
      expect(paceOf(v + 10, v)).toBeGreaterThan(paceOf(v, v) - 1);
      expect(paceOf(v, v + 10)).toBeGreaterThan(paceOf(v, v));
    }
  });

  it('neutral tactical profile is the multiplicative identity', () => {
    const p = neutralTacticalProfile();
    expect(p.attackMod).toBe(1);
    expect(p.defenceMod).toBe(1);
    expect(p.compatibility).toBe(1);
    expect(p.possessionShare).toBe(0.5);
  });
});
