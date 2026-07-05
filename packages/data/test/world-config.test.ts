import { describe, expect, it } from 'vitest';
import { WORLD, validateWorldConfig } from '../src/config/index';

describe('authored world config (§4 Layer A)', () => {
  it('passes validation', () => {
    expect(validateWorldConfig(WORLD)).toEqual([]);
  });

  it('meets the Phase-0 scale targets (~30 leagues, ~500+ clubs)', () => {
    expect(WORLD.leagues.length).toBeGreaterThanOrEqual(28);
    const totalClubs = WORLD.leagues.reduce((n, l) => n + l.clubs.length, 0);
    expect(totalClubs).toBeGreaterThanOrEqual(480);
    expect(WORLD.nations.length).toBeGreaterThanOrEqual(60);
  });

  it('every league nation exists and every club count is even', () => {
    const codes = new Set(WORLD.nations.map((n) => n.code));
    for (const league of WORLD.leagues) {
      expect(codes.has(league.nation), league.key).toBe(true);
      expect(league.clubs.length % 2, league.key).toBe(0);
    }
  });
});
