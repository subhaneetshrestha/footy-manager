/**
 * Club budget formulas — Finance-owned (contract §3.3 spirit: one owner).
 * Data seeds club budgets by calling these; UI displays them via the same
 * functions. No other module may re-derive budgets.
 */

import { powInt } from '../math/detMath';

/** Transfer budget from club reputation (requirement #10: realistic budgets). */
export function clubTransferBudget(reputation: number): number {
  return Math.round((2_000_000 * powInt(1.09, reputation - 50)) / 50_000) * 50_000;
}

/** Starting balance is a multiple of the transfer budget (first-pass model). */
export function clubStartingBalance(reputation: number): number {
  return clubTransferBudget(reputation) * 2;
}
