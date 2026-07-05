/**
 * World hydrator (Phase-1 vertical slice, DECISIONS.md D6/D7): builds an
 * engine WorldState for ONE league from the bundled config + generator.
 * Deterministic: same (leagueKey, seed) → identical world. On device the DAL
 * hydrates the same shape from save_<n>.db instead.
 */

import {
  FORMATION_KEYS,
  assertWorldInvariants,
  clubStartingBalance,
  clubTransferBudget,
  generateLeagueFixtures,
  staffWageBudget,
  totalMatchdaysFor,
  type WorldClub,
  type WorldPlayer,
  type WorldStaff,
  type WorldState,
} from '@footy/engine';
import {
  clamp,
  createRng,
  deriveSeed,
  type PlayStyle,
  type Position,
} from '@footy/shared';
import { WORLD as CONFIG } from '../config/index';
import { generateSquad, makeNationPicker } from '../generate/players';
import { generateClubStaff, generateFreeAgentStaff } from '../generate/staff';

export const DEFAULT_WORLD_SEED = 0x20260701;

/** AI play-style pools by club stature (user overrides their own in Tactics). */
const ELITE_STYLES: PlayStyle[] = ['tiki_taka', 'gegenpressing', 'high_press'];
const MID_STYLES: PlayStyle[] = ['balanced', 'wing_play', 'counter_attack', 'direct'];
const LOW_STYLES: PlayStyle[] = ['park_the_bus', 'counter_attack', 'direct', 'balanced'];

function ageAtSeasonStart(dob: string): number {
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  return m < 7 || (m === 7 && d === 1) ? 2026 - y : 2026 - y - 1;
}

export interface BuildWorldOptions {
  leagueKey: string;
  userClubKey: string;
  seed?: number;
}

export function buildWorldForLeague(options: BuildWorldOptions): WorldState {
  const leagueConfig = CONFIG.leagues.find((l) => l.key === options.leagueKey);
  if (!leagueConfig) throw new Error(`unknown league ${options.leagueKey}`);
  const seed = options.seed ?? DEFAULT_WORLD_SEED;
  const picker = makeNationPicker(leagueConfig, CONFIG.nations);

  const players: WorldPlayer[] = [];
  const clubs: WorldClub[] = [];
  const staff: WorldStaff[] = [];
  const leagueBank =
    CONFIG.nameBanks[
      CONFIG.nations.find((n) => n.code === leagueConfig.nation)?.nameBank ?? 'english'
    ];
  let userClubId = 0;

  leagueConfig.clubs.forEach((clubConfig, index) => {
    const clubId = index + 1;
    if (clubConfig.key === options.userClubKey) userClubId = clubId;
    const rng = createRng(deriveSeed(seed, clubId));
    const squad = generateSquad({
      league: leagueConfig,
      club: clubConfig,
      nations: CONFIG.nations,
      nameBanks: CONFIG.nameBanks,
      picker,
      rng,
    });

    const playerIds: number[] = [];
    for (const generated of squad) {
      const id = players.length + 1;
      playerIds.push(id);
      players.push({
        id,
        clubId,
        name:
          generated.knownAs ?? `${generated.firstName.charAt(0)}. ${generated.lastName}`,
        age: ageAtSeasonStart(generated.dob),
        position: generated.primaryPosition,
        secondaryPositions:
          generated.secondaryPositions === ''
            ? []
            : (generated.secondaryPositions.split(',') as Position[]),
        ovr: generated.ovr,
        potential: generated.potential,
        value: generated.value,
        wage: generated.wage,
        form: generated.form,
        fitness: generated.fitness,
        morale: generated.morale,
        ratings: generated.ratings,
      });
    }

    const styles =
      clubConfig.reputation >= 80 ? ELITE_STYLES : clubConfig.reputation >= 60 ? MID_STYLES : LOW_STYLES;
    const styleRng = createRng(deriveSeed(seed, 0x571e5, clubId));
    const formation = FORMATION_KEYS[styleRng.nextInt(0, FORMATION_KEYS.length - 1)] ?? '4-4-2';
    const playStyle = styles[styleRng.nextInt(0, styles.length - 1)] ?? 'balanced';

    const staffRng = createRng(deriveSeed(seed, 0x5aff, clubId));
    const staffIds: number[] = [];
    let staffBill = 0;
    for (const seedStaff of generateClubStaff(clubConfig.reputation, playStyle, leagueBank, staffRng)) {
      const id = staff.length + 1;
      staffIds.push(id);
      staffBill += seedStaff.wage;
      staff.push({ ...seedStaff, id, clubId });
    }

    const trainingFacilities = clamp(Math.round(clubConfig.reputation / 5), 1, 20);

    clubs.push({
      id: clubId,
      leagueId: 1,
      name: clubConfig.name,
      shortName: clubConfig.shortName,
      reputation: clubConfig.reputation,
      colorPrimary: clubConfig.colorPrimary,
      colorSecondary: clubConfig.colorSecondary,
      balance: clubStartingBalance(clubConfig.reputation),
      budgetTransfer: clubTransferBudget(clubConfig.reputation),
      budgetWage: Math.round(squad.reduce((sum, p) => sum + p.wage, 0) * 1.15),
      budgetStaffWage: Math.max(
        Math.round(staffBill * 1.3),
        staffWageBudget(clubConfig.reputation),
      ),
      trainingFacilities,
      youthFacilities: clamp(trainingFacilities + staffRng.nextInt(-2, 1), 1, 20),
      tactics: { formation, playStyle },
      playerIds,
      staffIds,
    });
  });

  // Free-agent coach pool for the hiring market.
  const poolRng = createRng(deriveSeed(seed, 0xfa9e));
  for (const seedStaff of generateFreeAgentStaff(60, leagueBank, poolRng)) {
    staff.push({ ...seedStaff, id: staff.length + 1, clubId: 0 });
  }

  if (userClubId === 0) throw new Error(`club ${options.userClubKey} not in ${options.leagueKey}`);

  const clubIds = clubs.map((c) => c.id);
  const world: WorldState = {
    seed,
    season: 2026,
    currentMatchday: 1,
    totalMatchdays: totalMatchdaysFor(clubIds.length),
    userClubId,
    leagues: [
      {
        id: 1,
        key: leagueConfig.key,
        name: leagueConfig.name,
        nation: leagueConfig.nation,
        reputation: leagueConfig.reputation,
        relegationSlots: leagueConfig.relegationSlots,
        clubIds,
      },
    ],
    clubs,
    players,
    staff,
    fixtures: generateLeagueFixtures(1, clubIds, 1),
    transfers: [],
  };
  assertWorldInvariants(world);
  return world;
}
