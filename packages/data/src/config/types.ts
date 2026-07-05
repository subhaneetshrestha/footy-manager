/**
 * Config-layer types for the seed.db build pipeline (dev-time only).
 * Authored world data (nations, name banks, leagues, clubs) conforms to these.
 * Runtime/canonical row types live in @footy/shared — do not duplicate them here.
 */

export const CONFEDERATIONS = [
  'UEFA',
  'CONMEBOL',
  'CONCACAF',
  'AFC',
  'CAF',
  'OFC',
] as const;
export type Confederation = (typeof CONFEDERATIONS)[number];

/** Locked set of name-bank keys. Multiple nations may share a bank. */
export const NAME_BANK_KEYS = [
  'english',
  'scottish',
  'irish',
  'welsh',
  'american',
  'spanish',
  'latam_spanish',
  'portuguese',
  'brazilian',
  'italian',
  'german',
  'french',
  'dutch',
  'belgian',
  'turkish',
  'greek',
  'scandinavian',
  'finnish',
  'polish',
  'czech',
  'hungarian',
  'romanian',
  'balkan',
  'ukrainian',
  'russian',
  'japanese',
  'korean',
  'chinese',
  'arabic',
  'persian',
  'maghreb',
  'nigerian',
  'ghanaian',
  'francophone_african',
] as const;
export type NameBankKey = (typeof NAME_BANK_KEYS)[number];

export interface NameBank {
  /** License-safe pool of common given names for this culture. >= 35 entries. */
  firstNames: string[];
  /** License-safe pool of common family names for this culture. >= 45 entries. */
  lastNames: string[];
}

export interface NationConfig {
  /** FIFA-style 3-letter code, e.g. 'ENG', 'BRA'. Unique. */
  code: string;
  name: string;
  /** License-safe alternative shown when the fictional-names toggle is on. */
  fictionalName: string;
  confederation: Confederation;
  /** Footballing strength/reputation, 0-100 world scale. */
  reputation: number;
  nameBank: NameBankKey;
}

export interface ClubConfig {
  /** Slug, unique within its league (e.g. 'arsenal'). DB real_key = `${league.key}:${club.key}`. */
  key: string;
  name: string;
  /** License-safe invented alternative (keep the city recognisable, drop the protected identity). */
  fictionalName: string;
  /** <= 14 chars, for tight mobile UI. */
  shortName: string;
  city: string;
  /** 0-100 world scale (drives budgets, squad quality, board targets). */
  reputation: number;
  stadiumName: string;
  stadiumCapacity: number;
  /** '#rrggbb' */
  colorPrimary: string;
  /** '#rrggbb' */
  colorSecondary: string;
}

export interface LeagueConfig {
  /** OpenFootball-style key, e.g. 'eng.1'. Unique. */
  key: string;
  name: string;
  fictionalName: string;
  /** NationConfig.code */
  nation: string;
  tier: number;
  /** 0-100 world scale. */
  reputation: number;
  promotionSlots: number;
  relegationSlots: number;
  /** null = no cap. */
  foreignPlayerCap: number | null;
  /** League-wide season TV/broadcast pool, EUR. */
  tvPoolBase: number;
  /** League-wide season prize pool, EUR. */
  prizePoolBase: number;
  /** League average attendance. */
  avgAttendanceBase: number;
  /** Fraction (0-1) of players in this league who are domestic. */
  domesticShare: number;
  /** Club count MUST be even (round-robin fixtures). */
  clubs: ClubConfig[];
}
