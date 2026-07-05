/**
 * Dev-time player generator (§4 Layer A): ~15-18k license-safe players with
 * realistic attribute/potential/age/nationality distributions per league tier
 * and position. Fully deterministic from the injected Rng.
 *
 * Statistical calibration against per-90 aggregate distributions is a tracked
 * Phase-0/1 task; these are the first-pass shapes.
 */

import {
  ALL_ATTRIBUTES,
  DEFENDING_ATTRIBUTES,
  GK_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  OVR_COEFFICIENTS,
  PHYSICAL_ATTRIBUTES,
  POSITION_GROUPS,
  TECHNICAL_ATTRIBUTES,
  clamp,
  computeOvr,
  type Attribute,
  type Foot,
  type PlayerRatings,
  type Position,
  type Rng,
  type SquadStatus,
} from '@footy/shared';
import { interpolate, playerValue, weeklyWage } from '@footy/engine';
import type { LeagueConfig, ClubConfig, NationConfig } from '../config/types';
import { subtractDaysIso } from './dateUtils';

export interface GeneratedPlayer {
  firstName: string;
  lastName: string;
  knownAs: string | null;
  nationCode: string;
  dob: string;
  primaryPosition: Position;
  secondaryPositions: string;
  heightCm: number;
  weightKg: number;
  preferredFoot: Foot;
  ovr: number;
  potential: number;
  value: number;
  wage: number;
  reputation: number;
  morale: number;
  form: number;
  fitness: number;
  squadStatus: SquadStatus;
  avatarSeed: number;
  ratings: PlayerRatings;
  injuryProneness: number;
  consistency: number;
  contractStartDate: string;
  contractEndDate: string;
  contractYearsLeft: number;
}

/** World start date for the season-0 seed. */
export const SEASON_START = { y: 2026, m: 7, d: 1 } as const;

const BASE_SQUAD: Position[] = [
  'GK', 'GK', 'GK',
  'CB', 'CB', 'CB', 'CB', 'CB',
  'RB', 'RB', 'LB', 'LB',
  'CDM', 'CDM',
  'CM', 'CM', 'CM', 'CM',
  'CAM', 'CAM',
  'RM', 'LM', 'RW', 'LW',
  'ST', 'ST', 'ST',
];

const EXTRA_POOL: Position[] = ['CB', 'CM', 'ST', 'RW', 'LW', 'RB', 'LB', 'CAM', 'CDM', 'RM', 'LM'];

const SECONDARY_POSITION: Partial<Record<Position, Position[]>> = {
  RB: ['RWB'],
  LB: ['LWB'],
  RWB: ['RB', 'RM'],
  LWB: ['LB', 'LM'],
  CB: ['CDM'],
  CDM: ['CM', 'CB'],
  CM: ['CDM', 'CAM'],
  CAM: ['CM', 'ST'],
  RM: ['RW', 'LM'],
  LM: ['LW', 'RM'],
  RW: ['RM', 'LW'],
  LW: ['LM', 'RW'],
  ST: ['CAM'],
};

/** Ability lost to youth (still growing) below peak age. */
const GROWTH_GAP_CURVE = [
  [16, 14],
  [17, 12],
  [18, 10],
  [19, 8],
  [20, 6],
  [21, 5],
  [22, 3],
  [23, 2],
  [24, 1],
  [25, 0],
] as const;

/** Ability lost to age past the peak. */
const DECLINE_CURVE = [
  [29, 0],
  [30, 1],
  [31, 2],
  [32, 4],
  [33, 6],
  [34, 8],
  [35, 11],
  [36, 14],
  [37, 17],
  [38, 20],
] as const;

const HEIGHT_BASE: Record<Position, number> = {
  GK: 189,
  CB: 187,
  RB: 179,
  LB: 179,
  RWB: 178,
  LWB: 178,
  CDM: 182,
  CM: 180,
  CAM: 178,
  RM: 176,
  LM: 176,
  RW: 176,
  LW: 176,
  ST: 183,
};

/** Approximate standard normal from 12 uniforms — basic ops only, deterministic. */
function gauss(rng: Rng): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += rng.nextFloat();
  return sum - 6;
}

const GK_SET = new Set<Attribute>(GK_ATTRIBUTES);

type AttrGroup = 'physical' | 'technical' | 'defending' | 'mental';

const ATTR_GROUP = new Map<Attribute, AttrGroup>([
  ...PHYSICAL_ATTRIBUTES.map((a) => [a, 'physical'] as const),
  ...TECHNICAL_ATTRIBUTES.map((a) => [a, 'technical'] as const),
  ...DEFENDING_ATTRIBUTES.map((a) => [a, 'defending'] as const),
  ...MENTAL_ATTRIBUTES.map((a) => [a, 'mental'] as const),
]);

/** Baseline level (relative to target OVR) for attributes outside a position's OVR formula. */
const OFF_FORMULA_LEVEL: Record<string, Record<AttrGroup, number>> = {
  goalkeeper: { physical: 0.68, technical: 0.5, defending: 0.42, mental: 0.72 },
  defence: { physical: 0.85, technical: 0.6, defending: 0.9, mental: 0.72 },
  midfield: { physical: 0.8, technical: 0.78, defending: 0.62, mental: 0.8 },
  attack: { physical: 0.84, technical: 0.78, defending: 0.42, mental: 0.75 },
};

function relFactor(position: Position, attr: Attribute): number {
  const coeff = OVR_COEFFICIENTS[position][attr] ?? 0;
  if (coeff > 0) return Math.min(1.06, 0.7 + 3.2 * coeff);
  const group = ATTR_GROUP.get(attr);
  if (group === undefined) return 0.6;
  return OFF_FORMULA_LEVEL[POSITION_GROUPS[position]]?.[group] ?? 0.6;
}

function generateRatings(position: Position, targetOvr: number, rng: Rng): PlayerRatings {
  const ratings = {} as PlayerRatings;
  const isGk = position === 'GK';

  for (const attr of ALL_ATTRIBUTES) {
    if (attr === 'injury_proneness' || attr === 'consistency') continue;
    if (!isGk && GK_SET.has(attr)) {
      ratings[attr] = 8 + rng.nextInt(0, 12); // outfielders can't keep goal
      continue;
    }
    const rel = relFactor(position, attr);
    ratings[attr] = clamp(Math.round(targetOvr * rel + gauss(rng) * 5), 10, 99);
  }

  // Two scaling passes pull the computed OVR onto the target.
  for (let pass = 0; pass < 2; pass++) {
    const current = computeOvr(position, ratings);
    if (current <= 0) break;
    const factor = targetOvr / current;
    for (const attr of ALL_ATTRIBUTES) {
      if (attr === 'injury_proneness' || attr === 'consistency') continue;
      if (!isGk && GK_SET.has(attr)) continue;
      ratings[attr] = clamp(Math.round((ratings[attr] ?? 10) * factor), 5, 99);
    }
  }

  ratings.injury_proneness = clamp(Math.round(45 + gauss(rng) * 15), 3, 97);
  ratings.consistency = clamp(Math.round(55 + gauss(rng) * 15), 10, 99);
  return ratings;
}

function sampleAge(rng: Rng): number {
  // Triangular 16..37 peaking around 26-27.
  return 16 + Math.floor(11 * (rng.nextFloat() + rng.nextFloat()));
}

function samplePosition(index: number, squadSize: number, rng: Rng): Position {
  if (index < BASE_SQUAD.length) return BASE_SQUAD[index] as Position;
  return EXTRA_POOL[rng.nextInt(0, EXTRA_POOL.length - 1)] as Position;
}

function sampleFoot(position: Position, rng: Rng): Foot {
  const leftBias = position === 'LB' || position === 'LWB' || position === 'LM' || position === 'LW';
  const roll = rng.nextFloat();
  if (leftBias) return roll < 0.6 ? 'left' : roll < 0.95 ? 'right' : 'either';
  return roll < 0.72 ? 'right' : roll < 0.95 ? 'left' : 'either';
}

export interface NationPicker {
  /** Deterministically pick a nationality for a player of this league. */
  pick(rng: Rng): NationConfig;
}

/** Precomputed weighted foreign pool + domestic share for one league. */
export function makeNationPicker(league: LeagueConfig, nations: NationConfig[]): NationPicker {
  const domestic = nations.find((n) => n.code === league.nation);
  if (!domestic) throw new Error(`league ${league.key}: nation ${league.nation} not found`);

  const foreign: { nation: NationConfig; cumulative: number }[] = [];
  let total = 0;
  for (const nation of nations) {
    if (nation.code === league.nation) continue;
    const confedBoost = nation.confederation === domestic.confederation ? 1.5 : 1;
    const weight = nation.reputation * nation.reputation * confedBoost;
    total += weight;
    foreign.push({ nation, cumulative: total });
  }

  return {
    pick(rng: Rng): NationConfig {
      if (rng.nextFloat() < league.domesticShare || total === 0) return domestic;
      const u = rng.nextFloat() * total;
      for (const entry of foreign) {
        if (u < entry.cumulative) return entry.nation;
      }
      return domestic;
    },
  };
}

export interface GenerateSquadInput {
  league: LeagueConfig;
  club: ClubConfig;
  nations: NationConfig[];
  nameBanks: Record<string, { firstNames: string[]; lastNames: string[] }>;
  picker: NationPicker;
  rng: Rng;
}

/** Club reputation → squad mean OVR (first-pass calibration). */
export function clubMeanOvr(clubReputation: number): number {
  return Math.round(30 + 0.5 * clubReputation);
}

export function generateSquad(input: GenerateSquadInput): GeneratedPlayer[] {
  const { league, club, nameBanks, picker, rng } = input;
  const squadSize = 28 + rng.nextInt(0, 4);
  const meanOvr = clubMeanOvr(club.reputation);
  const players: GeneratedPlayer[] = [];

  for (let i = 0; i < squadSize; i++) {
    const position = samplePosition(i, squadSize, rng);
    const age = sampleAge(rng);
    const peak = clamp(Math.round(meanOvr + gauss(rng) * 6), 30, 97);
    const growthGap = age <= 28 ? interpolate(GROWTH_GAP_CURVE, age) : 0;
    const decline = age >= 29 ? interpolate(DECLINE_CURVE, age) : 0;
    const targetOvr = clamp(Math.round(peak - growthGap - decline), 25, 96);

    const ratings = generateRatings(position, targetOvr, rng);
    const ovr = computeOvr(position, ratings);

    let potential = clamp(Math.max(ovr, Math.round(peak + Math.max(0, gauss(rng) * 3))), ovr, 99);
    if (age <= 19 && rng.nextFloat() < 0.04) {
      potential = clamp(potential + rng.nextInt(4, 10), ovr, 99); // wonderkid
    }

    const nation = picker.pick(rng);
    const bank = nameBanks[nation.nameBank];
    if (!bank) throw new Error(`missing name bank ${nation.nameBank}`);
    const firstName = bank.firstNames[rng.nextInt(0, bank.firstNames.length - 1)] ?? 'Alex';
    const lastName = bank.lastNames[rng.nextInt(0, bank.lastNames.length - 1)] ?? 'Smith';
    const knownAs =
      nation.nameBank === 'brazilian' && rng.nextFloat() < 0.25 ? firstName : null;

    const reputation = clamp(Math.round(0.9 * ovr + 0.3 * club.reputation - 20), 1, 99);
    const contractYearsLeft = 1 + rng.nextInt(0, 3);
    const heightCm = Math.round(HEIGHT_BASE[position] + gauss(rng) * 5);
    const secondaries = SECONDARY_POSITION[position];
    const secondaryPositions =
      secondaries !== undefined && rng.nextFloat() < 0.4
        ? (secondaries[rng.nextInt(0, secondaries.length - 1)] ?? '')
        : '';

    players.push({
      firstName,
      lastName,
      knownAs,
      nationCode: nation.code,
      dob: subtractDaysIso(SEASON_START.y - age, SEASON_START.m, SEASON_START.d, rng.nextInt(0, 364)),
      primaryPosition: position,
      secondaryPositions,
      heightCm,
      weightKg: Math.round(heightCm - 100 + gauss(rng) * 5),
      preferredFoot: sampleFoot(position, rng),
      ovr,
      potential,
      value: playerValue({
        ovr,
        potential,
        age,
        contractYearsLeft,
        reputation,
        position,
      }),
      wage: weeklyWage(ovr, club.reputation),
      reputation,
      morale: 55 + rng.nextInt(0, 25),
      form: 0,
      fitness: 100,
      squadStatus: 'backup', // assigned below once the squad is complete
      avatarSeed: rng.nextUint32(),
      ratings,
      injuryProneness: ratings.injury_proneness,
      consistency: ratings.consistency,
      contractStartDate: '2026-07-01',
      contractEndDate: `${2026 + contractYearsLeft}-06-30`,
      contractYearsLeft,
    });
  }

  assignSquadStatus(players);
  return players;
}

function assignSquadStatus(players: GeneratedPlayer[]): void {
  const byOvr = players
    .map((p, i) => ({ ovr: p.ovr, i }))
    .sort((a, b) => b.ovr - a.ovr || a.i - b.i);
  byOvr.forEach((entry, rank) => {
    const player = players[entry.i];
    if (player === undefined) return;
    const age = 2026 - Number(player.dob.slice(0, 4));
    if (rank < 3) player.squadStatus = 'star';
    else if (rank < 11) player.squadStatus = 'first_team';
    else if (rank < 18) player.squadStatus = 'rotation';
    else if (age <= 20) player.squadStatus = 'prospect';
    else player.squadStatus = 'backup';
  });
}
