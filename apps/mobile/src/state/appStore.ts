/**
 * App-shell state (§10): screen routing + active save session.
 * Zustand stores are hydrated via the DAL; nothing here touches SQLite
 * directly, and no simulation logic lives in the UI layer.
 */

import { create } from 'zustand';
import type { Dal } from '../db/dal';

export type Screen =
  | 'menu'
  | 'save_slots'
  | 'club_select'
  | 'career'
  | 'squad'
  | 'tactics'
  | 'table'
  | 'transfers';

/** The club chosen in the New Game flow (career setup, pre-save). */
export interface SelectedClub {
  leagueKey: string;
  leagueName: string;
  clubKey: string;
  clubName: string;
  shortName: string;
  city: string;
  nation: string;
  reputation: number;
  stadiumName: string;
  stadiumCapacity: number;
  colorPrimary: string;
  colorSecondary: string;
  transferBudget: number;
}

interface AppState {
  screen: Screen;
  selectedClub: SelectedClub | null;
  /** Open DAL for the active save; null on the menu. */
  activeDal: Dal | null;
  activeSlot: number | null;

  navigate(screen: Screen): void;
  selectClub(club: SelectedClub): void;
  openCareer(slot: number, dal: Dal): void;
  closeCareer(): Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'menu',
  selectedClub: null,
  activeDal: null,
  activeSlot: null,

  navigate(screen) {
    set({ screen });
  },

  selectClub(club) {
    set({ selectedClub: club, screen: 'career' });
  },

  openCareer(slot, dal) {
    set({ screen: 'career', activeSlot: slot, activeDal: dal });
  },

  async closeCareer() {
    const { activeDal } = get();
    if (activeDal) await activeDal.close();
    set({ screen: 'menu', activeSlot: null, activeDal: null, selectedClub: null });
  },
}));
