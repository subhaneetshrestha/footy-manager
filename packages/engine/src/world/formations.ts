/**
 * MVP formation catalogue (§7: trimmed set; the full 16-formation catalogue
 * is a later phase). A formation is 11 position slots, GK first.
 */

import type { Position } from '@footy/shared';

export const FORMATIONS = {
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CDM', 'RW', 'CAM', 'LW', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'RWB', 'CDM', 'CM', 'CAM', 'LWB', 'ST', 'ST'],
  '5-3-2': ['GK', 'RWB', 'CB', 'CB', 'CB', 'LWB', 'CDM', 'CM', 'CM', 'ST', 'ST'],
} as const satisfies Record<string, readonly Position[]>;

export type FormationKey = keyof typeof FORMATIONS;

export const FORMATION_KEYS = Object.keys(FORMATIONS) as FormationKey[];

export function formationSlots(key: FormationKey): readonly Position[] {
  return FORMATIONS[key];
}
