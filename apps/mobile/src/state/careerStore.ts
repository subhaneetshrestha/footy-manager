/**
 * Career session state: holds the live WorldState and drives it exclusively
 * through engine functions — no simulation logic in the UI layer (§2).
 * World mutations are deterministic (engine PRNG streams); the store bumps
 * the world reference so React re-renders.
 */

import { create } from 'zustand';
import { buildWorldForLeague } from '@footy/data';
import {
  STANDARD_LOAN_TERMS,
  autoFillStaff,
  clubOf,
  endOfSeasonVerdict,
  executeLoan,
  executeTransfer,
  findLoanTaker,
  fireStaff,
  hireStaff,
  isSeasonOver,
  playMatchday,
  playerById,
  renewContract,
  rolloverSeason,
  transferWindowFor,
  type BoardVerdict,
  type DetailedMatch,
  type Fixture,
  type FormationKey,
  type WorldState,
} from '@footy/engine';
import type { PlayStyle } from '@footy/shared';

interface CareerState {
  world: WorldState | null;
  /** True while the world is being generated. */
  building: boolean;
  /** True while a long sim (rest of season) runs. */
  advancing: boolean;
  lastUserFixture: Fixture | null;
  /** Pre-generated Tier-A timeline of the just-played user match (§6). */
  liveMatch: DetailedMatch | null;
  verdict: BoardVerdict | null;
  error: string | null;

  startCareer(leagueKey: string, clubKey: string): void;
  playNext(): void;
  simToSeasonEnd(): void;
  setTactics(formation: FormationKey, style: PlayStyle): void;
  buyPlayer(playerId: number): void;
  hireStaffMember(staffId: number): void;
  fireStaffMember(staffId: number): void;
  autoFillStaffRoles(): void;
  renewPlayerContract(playerId: number): void;
  loanOutPlayer(playerId: number): void;
  startNextSeason(): void;
  dismissMatch(): void;
  reset(): void;
}

/** New top-level reference so zustand subscribers re-render after mutation. */
function refresh(world: WorldState): WorldState {
  return { ...world };
}

function userFixtureOf(played: Fixture[], userClubId: number): Fixture | null {
  return (
    played.find((f) => f.homeClubId === userClubId || f.awayClubId === userClubId) ?? null
  );
}

export const useCareerStore = create<CareerState>((set, get) => ({
  world: null,
  building: false,
  advancing: false,
  lastUserFixture: null,
  liveMatch: null,
  verdict: null,
  error: null,

  startCareer(leagueKey, clubKey) {
    set({ building: true, world: null, verdict: null, lastUserFixture: null, error: null });
    // Defer one tick so the loading state paints before the sync build.
    setTimeout(() => {
      try {
        const world = buildWorldForLeague({ leagueKey, userClubKey: clubKey });
        set({ world, building: false });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e), building: false });
      }
    }, 50);
  },

  playNext() {
    const { world } = get();
    if (!world || isSeasonOver(world)) return;
    let detail: DetailedMatch | null = null;
    const played = playMatchday(world, (d) => {
      detail = d;
    });
    set({
      world: refresh(world),
      lastUserFixture: userFixtureOf(played, world.userClubId),
      liveMatch: detail,
      verdict: isSeasonOver(world) ? endOfSeasonVerdict(world, world.userClubId) : null,
      error: null,
    });
  },

  simToSeasonEnd() {
    const { world } = get();
    if (!world || isSeasonOver(world)) return;
    set({ advancing: true });
    setTimeout(() => {
      let last: Fixture | null = null;
      while (!isSeasonOver(world)) {
        const played = playMatchday(world);
        last = userFixtureOf(played, world.userClubId) ?? last;
      }
      set({
        world: refresh(world),
        advancing: false,
        lastUserFixture: last,
        verdict: endOfSeasonVerdict(world, world.userClubId),
        error: null,
      });
    }, 50);
  },

  setTactics(formation, style) {
    const { world } = get();
    if (!world) return;
    clubOf(world, world.userClubId).tactics = { formation, playStyle: style };
    set({ world: refresh(world) });
  },

  buyPlayer(playerId) {
    const { world } = get();
    if (!world) return;
    if (transferWindowFor(world.currentMatchday, world.totalMatchdays) === null) {
      set({ error: 'The transfer window is closed.' });
      return;
    }
    try {
      executeTransfer(world, playerId, world.userClubId, world.currentMatchday);
      set({ world: refresh(world), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  hireStaffMember(staffId) {
    const { world } = get();
    if (!world) return;
    try {
      hireStaff(world, staffId, world.userClubId);
      set({ world: refresh(world), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  fireStaffMember(staffId) {
    const { world } = get();
    if (!world) return;
    try {
      fireStaff(world, staffId);
      set({ world: refresh(world), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  autoFillStaffRoles() {
    const { world } = get();
    if (!world) return;
    autoFillStaff(world, world.userClubId);
    set({ world: refresh(world), error: null });
  },

  renewPlayerContract(playerId) {
    const { world } = get();
    if (!world) return;
    try {
      renewContract(world, playerId, 3);
      set({ world: refresh(world), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  loanOutPlayer(playerId) {
    const { world } = get();
    if (!world) return;
    if (transferWindowFor(world.currentMatchday, world.totalMatchdays) === null) {
      set({ error: 'The transfer window is closed.' });
      return;
    }
    try {
      const taker = findLoanTaker(world, playerId);
      if (taker === null) {
        set({ error: 'No clubs are interested in a loan right now.' });
        return;
      }
      const player = playerById(world, playerId);
      executeLoan(world, playerId, taker, {
        ...STANDARD_LOAN_TERMS,
        optionToBuyFee: player.value,
      });
      set({ world: refresh(world), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  startNextSeason() {
    const { world } = get();
    if (!world) return;
    rolloverSeason(world);
    set({ world: refresh(world), verdict: null, lastUserFixture: null, error: null });
  },

  dismissMatch() {
    set({ liveMatch: null });
  },

  reset() {
    set({
      world: null,
      building: false,
      advancing: false,
      lastUserFixture: null,
      liveMatch: null,
      verdict: null,
      error: null,
    });
  },
}));
