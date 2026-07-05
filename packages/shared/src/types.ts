/** Small cross-subsystem enums/aliases that don't belong to a single owner. */

export type Foot = 'left' | 'right' | 'either';

export const SQUAD_STATUSES = [
  'star',
  'first_team',
  'rotation',
  'backup',
  'prospect',
] as const;
export type SquadStatus = (typeof SQUAD_STATUSES)[number];

export const STAFF_ROLES = [
  'manager',
  'gk_coach',
  'def_coach',
  'mid_coach',
  'att_coach',
  'set_piece',
  'fitness',
  'physio',
  'analyst',
  'scout',
  'youth',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const TRANSFER_WINDOWS = ['summer', 'winter'] as const;
export type TransferWindow = (typeof TRANSFER_WINDOWS)[number];

export interface MatchScore {
  homeGoals: number;
  awayGoals: number;
}
