/** League table computation — pts desc, GD desc, GF desc, id asc (deterministic). */

import { clubOf, leagueOf, type WorldState } from '../world/types';

export interface TableRow {
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function leagueTable(world: WorldState, leagueId: number): TableRow[] {
  const league = leagueOf(world, leagueId);
  const rows: TableRow[] = league.clubIds.map((clubId) => ({
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
  const rowByClub: (TableRow | undefined)[] = [];
  for (const row of rows) rowByClub[row.clubId] = row;

  for (const fixture of world.fixtures) {
    if (!fixture.played || fixture.leagueId !== leagueId) continue;
    const home = rowByClub[fixture.homeClubId];
    const away = rowByClub[fixture.awayClubId];
    if (home === undefined || away === undefined) continue;
    home.played++;
    away.played++;
    home.goalsFor += fixture.homeGoals;
    home.goalsAgainst += fixture.awayGoals;
    away.goalsFor += fixture.awayGoals;
    away.goalsAgainst += fixture.homeGoals;
    if (fixture.homeGoals > fixture.awayGoals) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (fixture.homeGoals < fixture.awayGoals) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }

  for (const row of rows) row.goalDifference = row.goalsFor - row.goalsAgainst;

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.clubId - b.clubId,
  );
  return rows;
}

/** 1-based finishing position of a club in its league table. */
export function tablePositionOf(world: WorldState, clubId: number): number {
  const table = leagueTable(world, clubOf(world, clubId).leagueId);
  const index = table.findIndex((row) => row.clubId === clubId);
  if (index < 0) throw new Error(`club ${clubId} not in its league table`);
  return index + 1;
}
