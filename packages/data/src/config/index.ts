import { NAME_BANK_KEYS } from './types';
import type { LeagueConfig, NameBank, NameBankKey, NationConfig } from './types';
import { LEAGUES_EUROPE_TOP } from './leagues-europe-top';
import { LEAGUES_EUROPE_REST } from './leagues-europe-rest';
import { LEAGUES_WORLD } from './leagues-world';
import { NATIONS } from './nations';
import { NAME_BANKS } from './name-banks';

export * from './types';

export interface WorldConfig {
  nations: NationConfig[];
  nameBanks: Record<NameBankKey, NameBank>;
  leagues: LeagueConfig[];
}

export const WORLD: WorldConfig = {
  nations: NATIONS,
  nameBanks: NAME_BANKS,
  leagues: [...LEAGUES_EUROPE_TOP, ...LEAGUES_EUROPE_REST, ...LEAGUES_WORLD],
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Returns a list of problems; empty = valid. Run before every seed build. */
export function validateWorldConfig(world: WorldConfig): string[] {
  const errors: string[] = [];
  const nationByCode = new Map<string, NationConfig>();

  for (const nation of world.nations) {
    if (nationByCode.has(nation.code)) errors.push(`duplicate nation code ${nation.code}`);
    nationByCode.set(nation.code, nation);
    if (!(NAME_BANK_KEYS as readonly string[]).includes(nation.nameBank)) {
      errors.push(`nation ${nation.code}: unknown name bank '${nation.nameBank}'`);
    }
    if (nation.reputation < 0 || nation.reputation > 100) {
      errors.push(`nation ${nation.code}: reputation out of range`);
    }
  }

  for (const key of NAME_BANK_KEYS) {
    const bank = world.nameBanks[key];
    if (!bank) {
      errors.push(`missing name bank '${key}'`);
      continue;
    }
    if (bank.firstNames.length < 30) errors.push(`name bank '${key}': needs >=30 first names`);
    if (bank.lastNames.length < 40) errors.push(`name bank '${key}': needs >=40 last names`);
  }

  const leagueKeys = new Set<string>();
  for (const league of world.leagues) {
    const where = `league ${league.key}`;
    if (leagueKeys.has(league.key)) errors.push(`duplicate league key ${league.key}`);
    leagueKeys.add(league.key);
    if (!nationByCode.has(league.nation)) errors.push(`${where}: unknown nation ${league.nation}`);
    if (league.clubs.length < 10) errors.push(`${where}: too few clubs`);
    if (league.clubs.length % 2 !== 0) errors.push(`${where}: odd club count ${league.clubs.length}`);
    if (league.domesticShare < 0 || league.domesticShare > 1) {
      errors.push(`${where}: domesticShare out of range`);
    }
    if (league.reputation < 0 || league.reputation > 100) {
      errors.push(`${where}: reputation out of range`);
    }

    const clubKeys = new Set<string>();
    for (const club of league.clubs) {
      const clubWhere = `${where} club ${club.key}`;
      if (clubKeys.has(club.key)) errors.push(`${clubWhere}: duplicate key`);
      clubKeys.add(club.key);
      if (club.reputation < 0 || club.reputation > 100) {
        errors.push(`${clubWhere}: reputation out of range`);
      }
      if (club.shortName.length > 14) errors.push(`${clubWhere}: shortName too long`);
      if (!HEX_COLOR.test(club.colorPrimary) || !HEX_COLOR.test(club.colorSecondary)) {
        errors.push(`${clubWhere}: bad colour`);
      }
      if (club.stadiumCapacity < 1000 || club.stadiumCapacity > 130000) {
        errors.push(`${clubWhere}: implausible capacity ${club.stadiumCapacity}`);
      }
    }
  }

  return errors;
}
