/**
 * New Game → club browser (§10): every league, every club, realistic budgets
 * (requirement #10). Interim data source: the bundled world config from
 * @footy/data — Phase 1 swaps this to read from the save DB via the DAL.
 */

import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { WORLD, type ClubConfig, type LeagueConfig } from '@footy/data';
import { clubTransferBudget } from '@footy/engine';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { formatMoney } from '../ui/format';
import { ratingColor, useTheme, type Theme } from '../ui/theme';

export function ClubSelectScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const selectClub = useAppStore((s) => s.selectClub);
  const [league, setLeague] = useState<LeagueConfig | null>(null);

  const leagues = useMemo(
    () => [...WORLD.leagues].sort((a, b) => b.reputation - a.reputation),
    [],
  );

  const startCareer = useCareerStore((s) => s.startCareer);

  const onPickClub = (club: ClubConfig) => {
    if (!league) return;
    startCareer(league.key, club.key);
    selectClub({
      leagueKey: league.key,
      leagueName: league.name,
      clubKey: club.key,
      clubName: club.name,
      shortName: club.shortName,
      city: club.city,
      nation: league.nation,
      reputation: club.reputation,
      stadiumName: club.stadiumName,
      stadiumCapacity: club.stadiumCapacity,
      colorPrimary: club.colorPrimary,
      colorSecondary: club.colorSecondary,
      transferBudget: clubTransferBudget(club.reputation),
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => (league ? setLeague(null) : navigate('menu'))} hitSlop={12}>
          <Text style={styles.back}>‹ {league ? 'Leagues' : 'Menu'}</Text>
        </Pressable>
        <Text style={styles.title}>{league ? league.name : 'Choose a league'}</Text>
      </View>

      {league === null ? (
        <FlatList
          data={leagues}
          keyExtractor={(l) => l.key}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setLeague(item)}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.nation} · {item.clubs.length} clubs
                </Text>
              </View>
              <Text style={[styles.badge, { color: ratingColor(theme, item.reputation) }]}>
                {item.reputation}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={league.clubs}
          keyExtractor={(c) => c.key}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onPickClub(item)}>
              <View style={[styles.swatch, { backgroundColor: item.colorPrimary }]} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowSub}>
                  {item.city} · budget {formatMoney(clubTransferBudget(item.reputation))}
                </Text>
              </View>
              <Text style={[styles.badge, { color: ratingColor(theme, item.reputation) }]}>
                {item.reputation}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xxl },
    header: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      gap: spacing.xs,
    },
    back: { color: colors.textSecondary, ...typography.label },
    title: { color: colors.textPrimary, ...typography.heading },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.xxs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    rowText: { flex: 1 },
    rowTitle: { color: colors.textPrimary, ...typography.bodyLarge },
    rowSub: { color: colors.textSecondary, ...typography.caption },
    badge: { ...typography.title },
    swatch: { width: 14, height: 14, borderRadius: radius.sm },
  });
}
