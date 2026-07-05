/**
 * Staff hiring within the staff wage budget (§8, requirements #7/#8/#11).
 * One person per role per club; smaller clubs are constrained by budget.
 * autoFillStaff is the auto-manage path for players who want less
 * micromanagement.
 */

import type { StaffRole } from '@footy/shared';
import { clubOf, staffById, type WorldStaff, type WorldState } from '../world/types';

/** Roles every club should fill (set_piece/analyst are luxuries for now). */
export const CORE_STAFF_ROLES: StaffRole[] = [
  'manager',
  'gk_coach',
  'def_coach',
  'mid_coach',
  'att_coach',
  'fitness',
  'physio',
  'scout',
  'youth',
];

export function meanStaffRating(staff: WorldStaff): number {
  return (staff.ratingGk + staff.ratingDef + staff.ratingMid + staff.ratingAtt) / 4;
}

export function staffOf(world: WorldState, clubId: number): WorldStaff[] {
  return clubOf(world, clubId).staffIds.map((id) => staffById(world, id));
}

export function staffWageBill(world: WorldState, clubId: number): number {
  return staffOf(world, clubId).reduce((sum, s) => sum + s.wage, 0);
}

export function roleFilled(world: WorldState, clubId: number, role: StaffRole): boolean {
  return staffOf(world, clubId).some((s) => s.role === role);
}

export function freeAgentStaff(world: WorldState): WorldStaff[] {
  return world.staff.filter((s) => s.clubId === 0);
}

export function hireStaff(world: WorldState, staffId: number, clubId: number): void {
  const staff = staffById(world, staffId);
  const club = clubOf(world, clubId);
  if (staff.clubId !== 0) throw new Error(`${staff.name} is not a free agent`);
  if (roleFilled(world, clubId, staff.role)) {
    throw new Error(`the ${staff.role} role is already filled — fire them first`);
  }
  if (staffWageBill(world, clubId) + staff.wage > club.budgetStaffWage) {
    throw new Error('insufficient staff wage budget');
  }
  staff.clubId = clubId;
  club.staffIds.push(staffId);
}

export function fireStaff(world: WorldState, staffId: number): void {
  const staff = staffById(world, staffId);
  if (staff.clubId === 0) throw new Error(`${staff.name} is already a free agent`);
  const club = clubOf(world, staff.clubId);
  club.staffIds = club.staffIds.filter((id) => id !== staffId);
  staff.clubId = 0;
}

/**
 * Auto-manage (requirement #8): fill every missing core role with the best
 * affordable free agent. Deterministic. Returns the number hired.
 */
export function autoFillStaff(world: WorldState, clubId: number): number {
  const club = clubOf(world, clubId);
  let hired = 0;
  for (const role of CORE_STAFF_ROLES) {
    if (roleFilled(world, clubId, role)) continue;
    const budgetLeft = club.budgetStaffWage - staffWageBill(world, clubId);
    const candidates = freeAgentStaff(world)
      .filter((s) => s.role === role && s.wage <= budgetLeft)
      .sort((a, b) => meanStaffRating(b) - meanStaffRating(a) || a.id - b.id);
    const pick = candidates[0];
    if (pick === undefined) continue;
    hireStaff(world, pick.id, clubId);
    hired++;
  }
  return hired;
}
