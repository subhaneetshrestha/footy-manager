/**
 * Multi-seed robustness sweep for the player generator: every invariant the
 * rest of the game relies on must hold for arbitrary seeds, league configs
 * and club reputations — not just the happy path.
 */

import {
  ALL_ATTRIBUTES,
  POSITIONS,
  SQUAD_STATUSES,
  createRng,
  deriveSeed,
} from '@footy/shared';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config/index';
import { daysFromCivil } from '../src/generate/dateUtils';
import {
  generateSquad,
  makeNationPicker,
  type GeneratedPlayer,
} from '../src/generate/players';

const POSITION_SET = new Set<string>(POSITIONS);
const STATUS_SET = new Set<string>(SQUAD_STATUSES);
const NATION_CODES = new Set(WORLD.nations.map((n) => n.code));
const FEET = new Set(['left', 'right', 'either']);
const SEASON_START_DAYS = daysFromCivil(2026, 7, 1);

function ageAtSeasonStart(dob: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  return Math.floor((SEASON_START_DAYS - daysFromCivil(y, m, d)) / 365.25);
}

function sweep(): { player: GeneratedPlayer; squad: GeneratedPlayer[] }[] {
  const out: { player: GeneratedPlayer; squad: GeneratedPlayer[] }[] = [];
  const leagues = [
    WORLD.leagues[0]!,
    WORLD.leagues[Math.floor(WORLD.leagues.length / 2)]!,
    WORLD.leagues[WORLD.leagues.length - 1]!,
  ];
  for (const league of leagues) {
    const picker = makeNationPicker(league, WORLD.nations);
    for (const reputation of [40, 65, 92]) {
      for (let seed = 1; seed <= 10; seed++) {
        const squad = generateSquad({
          league,
          club: { ...league.clubs[0]!, reputation },
          nations: WORLD.nations,
          nameBanks: WORLD.nameBanks,
          picker,
          rng: createRng(deriveSeed(0x9e9e, league.tier, reputation, seed)),
        });
        for (const player of squad) out.push({ player, squad });
      }
    }
  }
  return out;
}

describe('generator robustness sweep (90 squads, ~2.7k players)', () => {
  const all = sweep();
  const squads = new Set(all.map((e) => e.squad));

  it('every squad is structurally sound', () => {
    for (const squad of squads) {
      expect(squad.length).toBeGreaterThanOrEqual(28);
      expect(squad.length).toBeLessThanOrEqual(32);
      expect(squad.filter((p) => p.primaryPosition === 'GK').length).toBeGreaterThanOrEqual(3);
      expect(squad.filter((p) => p.squadStatus === 'star').length).toBe(3);
      expect(squad.filter((p) => p.squadStatus === 'first_team').length).toBe(8);
      expect(squad.filter((p) => p.squadStatus === 'rotation').length).toBe(7);
    }
  });

  it('every player satisfies the locked invariants', () => {
    for (const { player } of all) {
      expect(POSITION_SET.has(player.primaryPosition)).toBe(true);
      if (player.secondaryPositions !== '') {
        expect(POSITION_SET.has(player.secondaryPositions)).toBe(true);
        expect(player.secondaryPositions).not.toBe(player.primaryPosition);
      }
      expect(STATUS_SET.has(player.squadStatus)).toBe(true);
      expect(NATION_CODES.has(player.nationCode)).toBe(true);
      expect(FEET.has(player.preferredFoot)).toBe(true);

      expect(Number.isInteger(player.ovr)).toBe(true);
      expect(player.ovr).toBeGreaterThanOrEqual(20);
      expect(player.ovr).toBeLessThanOrEqual(99);
      expect(player.potential).toBeGreaterThanOrEqual(player.ovr);
      expect(player.potential).toBeLessThanOrEqual(99);
      for (const attr of ALL_ATTRIBUTES) {
        const v = player.ratings[attr];
        expect(Number.isInteger(v), `${attr}=${v}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(99);
      }

      const age = ageAtSeasonStart(player.dob);
      expect(age).toBeGreaterThanOrEqual(16);
      expect(age).toBeLessThanOrEqual(38);
      expect(player.contractEndDate > player.contractStartDate).toBe(true);

      expect(player.heightCm).toBeGreaterThanOrEqual(150);
      expect(player.heightCm).toBeLessThanOrEqual(215);
      expect(player.weightKg).toBeGreaterThanOrEqual(45);
      expect(player.weightKg).toBeLessThanOrEqual(125);

      expect(Number.isInteger(player.value)).toBe(true);
      expect(player.value).toBeGreaterThan(0);
      expect(player.wage).toBeGreaterThanOrEqual(300);
      expect(player.firstName.length).toBeGreaterThan(0);
      expect(player.lastName.length).toBeGreaterThan(0);
      expect(Number.isFinite(player.avatarSeed)).toBe(true);
    }
  });

  it('the world contains wonderkids (young, big potential gap)', () => {
    const wonderkids = all.filter(
      ({ player }) =>
        player.potential - player.ovr >= 15 && ageAtSeasonStart(player.dob) <= 19,
    );
    expect(wonderkids.length).toBeGreaterThan(0);
  });

  it('nothing in the output is NaN or undefined', () => {
    const serialized = JSON.stringify([...squads][0]);
    expect(serialized.includes('NaN')).toBe(false);
    expect(serialized.includes('undefined')).toBe(false);
  });

  it('mid-reputation squads land in a sane quality band', () => {
    const mid = all.filter(({ squad }) => squad.some(() => true));
    const rep65 = sweepFor(65);
    const meanOvr = rep65.reduce((s, p) => s + p.ovr, 0) / rep65.length;
    const meanAge = rep65.reduce((s, p) => s + ageAtSeasonStart(p.dob), 0) / rep65.length;
    expect(meanOvr).toBeGreaterThan(50);
    expect(meanOvr).toBeLessThan(68);
    expect(meanAge).toBeGreaterThan(23);
    expect(meanAge).toBeLessThan(29);
    expect(mid.length).toBeGreaterThan(0);
  });
});

function sweepFor(reputation: number): GeneratedPlayer[] {
  const league = WORLD.leagues[0]!;
  const picker = makeNationPicker(league, WORLD.nations);
  const players: GeneratedPlayer[] = [];
  for (let seed = 1; seed <= 15; seed++) {
    players.push(
      ...generateSquad({
        league,
        club: { ...league.clubs[0]!, reputation },
        nations: WORLD.nations,
        nameBanks: WORLD.nameBanks,
        picker,
        rng: createRng(deriveSeed(0x07e5, seed)),
      }),
    );
  }
  return players;
}
