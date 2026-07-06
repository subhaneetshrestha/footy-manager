/**
 * WorldState ↔ relational rows (contract §3.4: a save IS a database — no
 * blob serialization). Pure data in/out: `worldToStatements` emits SQL +
 * bind rows for any driver (expo-sqlite on device, better-sqlite3 in tests);
 * `worldFromTables` rebuilds the WorldState from plain row objects.
 */

import {
  assertWorldInvariants,
  type ActiveInjury,
  type SeasonBooks,
  type WorldClub,
  type WorldLeague,
  type WorldLoan,
  type WorldPlayer,
  type WorldStaff,
  type WorldState,
} from '@footy/engine';
import {
  ALL_ATTRIBUTES,
  type Attribute,
  type PlayerRatings,
  type PlayStyle,
  type Position,
} from '@footy/shared';
import type { FormationKey } from '@footy/engine';

export interface SaveStatement {
  sql: string;
  rows: unknown[][];
}

const RATING_COLS = [...ALL_ATTRIBUTES, 'potential_ability'];

/** Full-snapshot save: clear world tables, then bulk-insert current state. */
export function worldToStatements(world: WorldState): SaveStatement[] {
  const statements: SaveStatement[] = [];
  const clear = (table: string) => statements.push({ sql: `DELETE FROM ${table}`, rows: [[]] });
  for (const table of [
    'world_state', 'leagues', 'clubs', 'players', 'player_ratings', 'staff',
    'fixtures', 'transfers', 'injuries', 'loans', 'deferred_payments', 'sell_on_clauses',
  ]) {
    clear(table);
  }

  statements.push({
    sql: 'INSERT INTO world_state(key, value) VALUES (?, ?)',
    rows: [
      ['seed', String(world.seed)],
      ['season', String(world.season)],
      ['current_matchday', String(world.currentMatchday)],
      ['total_matchdays', String(world.totalMatchdays)],
      ['user_club_id', String(world.userClubId)],
      ['manager_reputation', String(world.managerReputation ?? '')],
    ],
  });

  statements.push({
    sql: `INSERT INTO leagues(id, name, real_key, nation_code, reputation, relegation_slots,
          tv_pool_base, prize_pool_base) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.leagues.map((l) => [
      l.id, l.name, l.key, l.nation, l.reputation, l.relegationSlots,
      l.tvPoolBase ?? null, l.prizePoolBase ?? null,
    ]),
  });

  statements.push({
    sql: `INSERT INTO clubs(id, league_id, name, short_name, reputation, color_primary,
          color_secondary, stadium_capacity, balance, budget_transfer, budget_wage,
          budget_staff_wage, training_facilities, youth_facilities, formation, play_style,
          ffp_strikes, transfer_embargo, season_spend, season_income, books_json,
          squad_order_json, staff_order_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.clubs.map((c) => [
      c.id, c.leagueId, c.name, c.shortName, c.reputation, c.colorPrimary,
      c.colorSecondary, c.stadiumCapacity ?? null, c.balance, c.budgetTransfer, c.budgetWage,
      c.budgetStaffWage, c.trainingFacilities, c.youthFacilities, c.tactics.formation,
      c.tactics.playStyle, c.ffpStrikes ?? 0, c.transferEmbargo === true ? 1 : 0,
      c.seasonTransferSpend ?? 0, c.seasonTransferIncome ?? 0,
      c.books === undefined ? null : JSON.stringify(c.books),
      JSON.stringify(c.playerIds), JSON.stringify(c.staffIds),
    ]),
  });

  statements.push({
    sql: `INSERT INTO players(id, club_id, known_as, age, primary_position,
          secondary_positions, ovr, potential, value, wage, contract_years, form, fitness,
          morale, retired, injury_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.players.map((p) => [
      p.id, p.clubId, p.name, p.age, p.position, p.secondaryPositions.join(','),
      p.ovr, p.potential, p.value, p.wage, p.contractYearsLeft, p.form, p.fitness,
      p.morale, p.retired === true ? 1 : 0,
      p.injury === null ? null : JSON.stringify(p.injury),
    ]),
  });

  statements.push({
    sql: `INSERT INTO player_ratings(player_id, ${RATING_COLS.join(', ')})
          VALUES (?, ${RATING_COLS.map(() => '?').join(', ')})`,
    rows: world.players.map((p) => [
      p.id,
      ...ALL_ATTRIBUTES.map((attr) => p.ratings[attr] ?? 0),
      p.potential,
    ]),
  });

  statements.push({
    sql: `INSERT INTO staff(id, club_id, first_name, last_name, role, rating_gk, rating_def,
          rating_mid, rating_att, playstyle_ratings, wage)
          VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.staff.map((s) => [
      s.id, s.clubId, s.name, s.role, s.ratingGk, s.ratingDef, s.ratingMid, s.ratingAtt,
      JSON.stringify(s.playstyleRatings), s.wage,
    ]),
  });

  statements.push({
    sql: `INSERT INTO fixtures(id, competition_id, matchday, home_club_id, away_club_id,
          home_goals, away_goals, played) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.fixtures.map((f) => [
      f.id, f.leagueId, f.matchday, f.homeClubId, f.awayClubId,
      f.homeGoals, f.awayGoals, f.played ? 1 : 0,
    ]),
  });

  statements.push({
    sql: `INSERT INTO transfers(id, player_id, from_club_id, to_club_id, fee, season, matchday)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    rows: world.transfers.map((t, i) => [
      i + 1, t.playerId, t.fromClubId, t.toClubId, t.fee, t.season, t.matchday,
    ]),
  });

  statements.push({
    sql: `INSERT INTO injuries(id, player_id, club_id, season, matchday, tier, type, days)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.injuries.map((r, i) => [
      i + 1, r.playerId, r.clubId, r.season, r.matchday, r.tier, r.type, r.days,
    ]),
  });

  statements.push({
    sql: `INSERT INTO loans(id, player_id, owner_club_id, loan_club_id, wage_split, buy_fee,
          obligation_to_buy, recall_allowed, start_season) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rows: world.loans.map((l, i) => [
      i + 1, l.playerId, l.ownerClubId, l.loanClubId, l.wageSplit, l.optionToBuyFee,
      l.obligationToBuy ? 1 : 0, l.recallAllowed ? 1 : 0, l.startSeason,
    ]),
  });

  statements.push({
    sql: 'INSERT INTO deferred_payments(id, club_id, amount, due_season) VALUES (?, ?, ?, ?)',
    rows: (world.deferredPayments ?? []).map((d, i) => [i + 1, d.clubId, d.amount, d.dueSeason]),
  });

  statements.push({
    sql: 'INSERT INTO sell_on_clauses(player_id, beneficiary_club_id, pct) VALUES (?, ?, ?)',
    // Canonical order: player_id is the PK (one clause per player), so loading
    // returns id order — emit sorted so save(load(x)) === save(x).
    rows: [...(world.sellOnClauses ?? [])]
      .sort((a, b) => a.playerId - b.playerId)
      .map((c) => [c.playerId, c.beneficiaryClubId, c.pct]),
  });

  return statements.filter((s) => s.rows.length > 0);
}

/** Row shapes as any-typed records; drivers return plain objects. */
export interface SaveTables {
  world_state: Record<string, unknown>[];
  leagues: Record<string, unknown>[];
  clubs: Record<string, unknown>[];
  players: Record<string, unknown>[];
  player_ratings: Record<string, unknown>[];
  staff: Record<string, unknown>[];
  fixtures: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  injuries: Record<string, unknown>[];
  loans: Record<string, unknown>[];
  deferred_payments: Record<string, unknown>[];
  sell_on_clauses: Record<string, unknown>[];
}

export const SAVE_TABLE_QUERIES: Record<keyof SaveTables, string> = {
  world_state: 'SELECT * FROM world_state',
  leagues: 'SELECT * FROM leagues WHERE nation_code IS NOT NULL ORDER BY id',
  clubs: 'SELECT * FROM clubs ORDER BY id',
  players: 'SELECT * FROM players ORDER BY id',
  player_ratings: 'SELECT * FROM player_ratings ORDER BY player_id',
  staff: 'SELECT * FROM staff ORDER BY id',
  fixtures: 'SELECT * FROM fixtures ORDER BY id',
  transfers: 'SELECT * FROM transfers ORDER BY id',
  injuries: 'SELECT * FROM injuries ORDER BY id',
  loans: 'SELECT * FROM loans ORDER BY id',
  deferred_payments: 'SELECT * FROM deferred_payments ORDER BY id',
  sell_on_clauses: 'SELECT * FROM sell_on_clauses ORDER BY player_id',
};

const num = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string => String(v ?? '');

export function worldFromTables(tables: SaveTables): WorldState {
  const kv = new Map(tables.world_state.map((r) => [str(r.key), str(r.value)]));

  const ratingsByPlayer = new Map<number, PlayerRatings>();
  for (const row of tables.player_ratings) {
    const ratings = {} as PlayerRatings;
    for (const attr of ALL_ATTRIBUTES) ratings[attr as Attribute] = num(row[attr]);
    ratingsByPlayer.set(num(row.player_id), ratings);
  }

  const players: WorldPlayer[] = tables.players.map((r) => ({
    id: num(r.id),
    clubId: num(r.club_id),
    name: str(r.known_as),
    age: num(r.age),
    position: str(r.primary_position) as Position,
    secondaryPositions:
      str(r.secondary_positions) === ''
        ? []
        : (str(r.secondary_positions).split(',') as Position[]),
    ovr: num(r.ovr),
    potential: num(r.potential),
    value: num(r.value),
    wage: num(r.wage),
    contractYearsLeft: num(r.contract_years),
    form: num(r.form),
    fitness: num(r.fitness),
    morale: num(r.morale),
    ...(num(r.retired) === 1 ? { retired: true } : {}),
    injury: r.injury_json == null ? null : (JSON.parse(str(r.injury_json)) as ActiveInjury),
    ratings: ratingsByPlayer.get(num(r.id))!,
  }));

  const clubs: WorldClub[] = tables.clubs.map((r) => ({
    id: num(r.id),
    leagueId: num(r.league_id),
    name: str(r.name),
    shortName: str(r.short_name),
    reputation: num(r.reputation),
    colorPrimary: str(r.color_primary),
    colorSecondary: str(r.color_secondary),
    ...(r.stadium_capacity == null ? {} : { stadiumCapacity: num(r.stadium_capacity) }),
    balance: num(r.balance),
    budgetTransfer: num(r.budget_transfer),
    budgetWage: num(r.budget_wage),
    budgetStaffWage: num(r.budget_staff_wage),
    trainingFacilities: num(r.training_facilities),
    youthFacilities: num(r.youth_facilities),
    tactics: {
      formation: str(r.formation) as FormationKey,
      playStyle: str(r.play_style) as PlayStyle,
    },
    ...(num(r.ffp_strikes) > 0 ? { ffpStrikes: num(r.ffp_strikes) } : {}),
    ...(num(r.transfer_embargo) === 1 ? { transferEmbargo: true } : {}),
    ...(num(r.season_spend) !== 0 ? { seasonTransferSpend: num(r.season_spend) } : {}),
    ...(num(r.season_income) !== 0 ? { seasonTransferIncome: num(r.season_income) } : {}),
    ...(r.books_json == null ? {} : { books: JSON.parse(str(r.books_json)) as SeasonBooks }),
    // Preserve exact roster ordering — determinism depends on identical state.
    playerIds: r.squad_order_json == null ? [] : (JSON.parse(str(r.squad_order_json)) as number[]),
    staffIds: r.staff_order_json == null ? [] : (JSON.parse(str(r.staff_order_json)) as number[]),
  }));

  const staff: WorldStaff[] = tables.staff.map((r) => ({
    id: num(r.id),
    clubId: num(r.club_id),
    name: str(r.last_name),
    role: str(r.role) as WorldStaff['role'],
    ratingGk: num(r.rating_gk),
    ratingDef: num(r.rating_def),
    ratingMid: num(r.rating_mid),
    ratingAtt: num(r.rating_att),
    playstyleRatings: JSON.parse(str(r.playstyle_ratings)) as WorldStaff['playstyleRatings'],
    wage: num(r.wage),
  }));

  const leagues: WorldLeague[] = tables.leagues.map((r) => ({
    id: num(r.id),
    key: str(r.real_key),
    name: str(r.name),
    nation: str(r.nation_code),
    reputation: num(r.reputation),
    relegationSlots: num(r.relegation_slots),
    ...(r.tv_pool_base == null ? {} : { tvPoolBase: num(r.tv_pool_base) }),
    ...(r.prize_pool_base == null ? {} : { prizePoolBase: num(r.prize_pool_base) }),
    clubIds: clubs.filter((c) => c.leagueId === num(r.id)).map((c) => c.id),
  }));

  const loans: WorldLoan[] = tables.loans.map((r) => ({
    playerId: num(r.player_id),
    ownerClubId: num(r.owner_club_id),
    loanClubId: num(r.loan_club_id),
    wageSplit: num(r.wage_split),
    optionToBuyFee: r.buy_fee == null ? null : num(r.buy_fee),
    obligationToBuy: num(r.obligation_to_buy) === 1,
    recallAllowed: num(r.recall_allowed) === 1,
    startSeason: num(r.start_season),
  }));

  const managerRep = kv.get('manager_reputation');
  const world: WorldState = {
    seed: num(kv.get('seed')),
    season: num(kv.get('season')),
    currentMatchday: num(kv.get('current_matchday')),
    totalMatchdays: num(kv.get('total_matchdays')),
    userClubId: num(kv.get('user_club_id')),
    ...(managerRep !== undefined && managerRep !== ''
      ? { managerReputation: Number(managerRep) }
      : {}),
    leagues,
    clubs,
    players,
    staff,
    fixtures: tables.fixtures.map((r) => ({
      id: num(r.id),
      leagueId: num(r.competition_id),
      matchday: num(r.matchday),
      homeClubId: num(r.home_club_id),
      awayClubId: num(r.away_club_id),
      homeGoals: num(r.home_goals),
      awayGoals: num(r.away_goals),
      played: num(r.played) === 1,
    })),
    transfers: tables.transfers.map((r) => ({
      playerId: num(r.player_id),
      fromClubId: num(r.from_club_id),
      toClubId: num(r.to_club_id),
      fee: num(r.fee),
      season: num(r.season),
      matchday: num(r.matchday),
    })),
    injuries: tables.injuries.map((r) => ({
      playerId: num(r.player_id),
      clubId: num(r.club_id),
      season: num(r.season),
      matchday: num(r.matchday),
      tier: str(r.tier) as WorldState['injuries'][number]['tier'],
      type: str(r.type),
      days: num(r.days),
    })),
    loans,
    deferredPayments: tables.deferred_payments.map((r) => ({
      clubId: num(r.club_id),
      amount: num(r.amount),
      dueSeason: num(r.due_season),
    })),
    sellOnClauses: tables.sell_on_clauses.map((r) => ({
      playerId: num(r.player_id),
      beneficiaryClubId: num(r.beneficiary_club_id),
      pct: num(r.pct),
    })),
  };

  assertWorldInvariants(world);
  return world;
}
