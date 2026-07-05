/**
 * Best-XI selection and position-weighted team strength (§6 inputs).
 * Effective ability = OVR × position fit, so playing people out of position
 * costs real strength — the raw-material half of requirement #6.
 */

import { POSITION_GROUPS, type Position } from '@footy/shared';
import { FORMATIONS, type FormationKey } from '../world/formations';
import type { WorldPlayer } from '../world/types';

/** Multiplier for a player occupying a formation slot. */
export function positionFit(
  player: Pick<WorldPlayer, 'position' | 'secondaryPositions'>,
  slot: Position,
): number {
  if (player.position === slot) return 1;
  if (player.secondaryPositions.includes(slot)) return 0.92;
  if (slot === 'GK' || player.position === 'GK') return 0.3; // emergency keeper etc.
  if (POSITION_GROUPS[player.position] === POSITION_GROUPS[slot]) return 0.82;
  return 0.65;
}

export interface XiSlot {
  slot: Position;
  player: WorldPlayer;
  fit: number;
  effectiveOvr: number;
}

export interface SelectedXi {
  formation: FormationKey;
  slots: XiSlot[];
  /** Mean position-fit of the XI, 0..1 — feeds the Tactics compatibility. */
  avgFit: number;
}

/** Greedy slot-order pick of the strongest legal XI. Deterministic (id ties). */
export function selectBestXi(squad: WorldPlayer[], formation: FormationKey): SelectedXi {
  const slots = FORMATIONS[formation];
  if (squad.length < slots.length) {
    throw new Error(`squad of ${squad.length} cannot field ${slots.length}`);
  }
  const used = new Set<number>(); // membership checks only — never iterated
  const chosen: XiSlot[] = [];
  let fitSum = 0;

  for (const slot of slots) {
    let best: WorldPlayer | undefined;
    let bestEff = -1;
    let bestFit = 0;
    for (const player of squad) {
      if (used.has(player.id)) continue;
      const fit = positionFit(player, slot);
      const eff = player.ovr * fit;
      if (eff > bestEff || (eff === bestEff && best !== undefined && player.id < best.id)) {
        best = player;
        bestEff = eff;
        bestFit = fit;
      }
    }
    if (best === undefined) throw new Error('no candidate for slot');
    used.add(best.id);
    chosen.push({ slot, player: best, fit: bestFit, effectiveOvr: bestEff });
    fitSum += bestFit;
  }

  return { formation, slots: chosen, avgFit: fitSum / slots.length };
}

export interface TeamStrength {
  /** 0-99-scale attacking quality (Tier-B input). */
  attack: number;
  /** 0-99-scale defensive quality (Tier-B input). */
  defence: number;
}

const ATTACK_WEIGHTS: Record<string, number> = {
  goalkeeper: 0.02,
  defence: 0.15,
  midfield: 0.38,
  attack: 0.45,
};

const DEFENCE_WEIGHTS: Record<string, number> = {
  goalkeeper: 0.22,
  defence: 0.45,
  midfield: 0.26,
  attack: 0.07,
};

/** Position-weighted squad quality (§6: attack/defence derive from squad OVR). */
export function teamStrength(xi: SelectedXi): TeamStrength {
  let attackAcc = 0;
  let attackW = 0;
  let defenceAcc = 0;
  let defenceW = 0;
  for (const entry of xi.slots) {
    const group = POSITION_GROUPS[entry.slot];
    const aw = ATTACK_WEIGHTS[group] ?? 0;
    const dw = DEFENCE_WEIGHTS[group] ?? 0;
    attackAcc += aw * entry.effectiveOvr;
    attackW += aw;
    defenceAcc += dw * entry.effectiveOvr;
    defenceW += dw;
  }
  return { attack: attackAcc / attackW, defence: defenceAcc / defenceW };
}
