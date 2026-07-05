import { ALL_ATTRIBUTES, createRng } from '@footy/shared';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/index';
import { generateSquad, makeNationPicker } from '../src/generate/players';
import type { GeneratedPlayer } from '../src/generate/players';

const league = WORLD.leagues[0]!;
const club = league.clubs[0]!;

function generate(seed: number, reputation = club.reputation): GeneratedPlayer[] {
  return generateSquad({
    league,
    club: { ...club, reputation },
    nations: WORLD.nations,
    nameBanks: WORLD.nameBanks,
    picker: makeNationPicker(league, WORLD.nations),
    rng: createRng(seed),
  });
}

describe('player generator', () => {
  it('is deterministic for a given seed', () => {
    expect(JSON.stringify(generate(42))).toBe(JSON.stringify(generate(42)));
    expect(JSON.stringify(generate(42))).not.toBe(JSON.stringify(generate(43)));
  });

  it('respects locked invariants: 0-99 scale, POT >= OVR, sane squads', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const squad = generate(seed);
      expect(squad.length).toBeGreaterThanOrEqual(28);
      expect(squad.length).toBeLessThanOrEqual(32);
      expect(squad.filter((p) => p.primaryPosition === 'GK').length).toBeGreaterThanOrEqual(3);
      for (const player of squad) {
        expect(player.potential, 'POT >= OVR').toBeGreaterThanOrEqual(player.ovr);
        expect(player.ovr).toBeGreaterThanOrEqual(0);
        expect(player.ovr).toBeLessThanOrEqual(99);
        for (const attr of ALL_ATTRIBUTES) {
          const v = player.ratings[attr];
          expect(v, `${attr} in range`).toBeGreaterThanOrEqual(0);
          expect(v, `${attr} in range`).toBeLessThanOrEqual(99);
        }
        expect(player.value).toBeGreaterThan(0);
        expect(player.wage).toBeGreaterThanOrEqual(300);
        expect(player.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('club reputation drives squad quality (requirement #10)', () => {
    const meanOf = (players: GeneratedPlayer[]) =>
      players.reduce((sum, p) => sum + p.ovr, 0) / players.length;
    const elite = meanOf(generate(7, 92));
    const modest = meanOf(generate(7, 55));
    expect(elite - modest).toBeGreaterThan(10);
  });

  it('produces domestic majorities per the league config', () => {
    const squads: GeneratedPlayer[] = [];
    for (let seed = 1; seed <= 10; seed++) squads.push(...generate(seed));
    const domesticNation = WORLD.nations.find((n) => n.code === league.nation)!;
    const domestic = squads.filter((p) => p.nationCode === domesticNation.code).length;
    const share = domestic / squads.length;
    expect(share).toBeGreaterThan(league.domesticShare - 0.12);
    expect(share).toBeLessThan(league.domesticShare + 0.12);
  });
});
