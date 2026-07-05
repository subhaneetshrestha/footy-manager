/**
 * Career hub (Phase-1 vertical slice): season header, next fixture, last
 * result, matchday controls, board verdict at season end, and navigation to
 * squad / tactics / table / transfers. All sim work happens in the engine via
 * the career store.
 */

import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  clubOf,
  fixturesForMatchday,
  isSeasonOver,
  playerById,
  tablePositionOf,
  transferWindowFor,
  type Fixture,
  type WorldState,
} from '@footy/engine';
import { useAppStore, type Screen } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { formatMoney } from '../ui/format';
import { useTheme, type Theme } from '../ui/theme';

function describeUserFixture(world: WorldState, fixture: Fixture): string {
  const isHome = fixture.homeClubId === world.userClubId;
  const opponent = clubOf(world, isHome ? fixture.awayClubId : fixture.homeClubId);
  if (!fixture.played) return `vs ${opponent.name} (${isHome ? 'H' : 'A'})`;
  const us = isHome ? fixture.homeGoals : fixture.awayGoals;
  const them = isHome ? fixture.awayGoals : fixture.homeGoals;
  const letter = us > them ? 'W' : us === them ? 'D' : 'L';
  return `${letter} ${us}-${them} vs ${opponent.name} (${isHome ? 'H' : 'A'})`;
}

export function CareerScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const { world, building, advancing, lastUserFixture, verdict, error } = useCareerStore();
  const playNext = useCareerStore((s) => s.playNext);
  const simToSeasonEnd = useCareerStore((s) => s.simToSeasonEnd);
  const startNextSeason = useCareerStore((s) => s.startNextSeason);
  const reset = useCareerStore((s) => s.reset);

  if (building || !world) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.loading}>
          {error ? `world build failed: ${error}` : 'Generating your world…'}
        </Text>
      </View>
    );
  }

  const club = clubOf(world, world.userClubId);
  const league = world.leagues[0];
  const seasonOver = isSeasonOver(world);
  const anyPlayed = world.fixtures.some((f) => f.played);
  const position = anyPlayed ? tablePositionOf(world, world.userClubId) : null;
  const nextFixture = seasonOver
    ? null
    : (fixturesForMatchday(world.fixtures, world.currentMatchday).find(
        (f) => f.homeClubId === world.userClubId || f.awayClubId === world.userClubId,
      ) ?? null);
  const window = transferWindowFor(world.currentMatchday, world.totalMatchdays);

  const navButton = (label: string, screen: Screen) => (
    <Pressable key={screen} style={styles.navButton} onPress={() => navigate(screen)}>
      <Text style={styles.navButtonText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={[styles.swatch, { backgroundColor: club.colorPrimary }]} />
        <View style={styles.headerText}>
          <Text style={styles.club}>{club.name}</Text>
          <Text style={styles.sub}>
            {league?.name} · Season {world.season}/{(world.season + 1) % 100}
            {position !== null ? ` · P${position}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>
          {seasonOver
            ? 'Season complete'
            : `Matchday ${world.currentMatchday}/${world.totalMatchdays}${window ? ` · ${window} window open` : ''}`}
        </Text>
        {nextFixture !== null && (
          <Text style={styles.cardValue}>Next: {describeUserFixture(world, nextFixture)}</Text>
        )}
        {lastUserFixture !== null && (
          <Text style={styles.cardValue}>Last: {describeUserFixture(world, lastUserFixture)}</Text>
        )}
        <Text style={styles.cardMuted}>Transfer budget {formatMoney(club.budgetTransfer)}</Text>
      </View>

      {(() => {
        const treatmentRoom = club.playerIds
          .map((id) => playerById(world, id))
          .filter((p) => p.injury !== null && p.injury.returnMatchday > world.currentMatchday);
        if (treatmentRoom.length === 0) return null;
        return (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Treatment room ({treatmentRoom.length})</Text>
            {treatmentRoom.slice(0, 5).map((p) => (
              <Text key={p.id} style={styles.cardMuted}>
                {p.name} — {p.injury!.type}, back ~MD {p.injury!.returnMatchday}
              </Text>
            ))}
          </View>
        );
      })()}

      {verdict !== null && (
        <View style={[styles.card, verdict.verdict === 'sacked' ? styles.cardBad : styles.cardGood]}>
          <Text style={styles.cardLabel}>Board verdict — target: {verdict.targetLabel}</Text>
          <Text style={styles.cardValue}>{verdict.message}</Text>
          {verdict.verdict === 'sacked' ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                reset();
                navigate('menu');
              }}
            >
              <Text style={styles.primaryButtonText}>Career over — back to menu</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryButton} onPress={startNextSeason}>
              <Text style={styles.primaryButtonText}>
                Start season {world.season + 1}/{(world.season + 2) % 100}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {!seasonOver && (
        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, advancing && styles.disabled]}
            disabled={advancing}
            onPress={playNext}
          >
            <Text style={styles.primaryButtonText}>Play matchday</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, advancing && styles.disabled]}
            disabled={advancing}
            onPress={simToSeasonEnd}
          >
            <Text style={styles.primaryButtonText}>
              {advancing ? 'Simulating…' : 'Sim to season end'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.navGrid}>
        {navButton('Squad', 'squad')}
        {navButton('Tactics', 'tactics')}
        {navButton('League table', 'table')}
        {navButton('Transfers', 'transfers')}
        {navButton('Staff', 'staff')}
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={styles.leave}
        onPress={() => {
          reset();
          navigate('menu');
        }}
      >
        <Text style={styles.leaveText}>Leave career</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
    center: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
    },
    loading: { color: colors.textSecondary, ...typography.body },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    swatch: { width: 40, height: 40, borderRadius: radius.md },
    headerText: { flex: 1 },
    club: { color: colors.textPrimary, ...typography.heading },
    sub: { color: colors.textSecondary, ...typography.caption },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    cardGood: { borderWidth: 1, borderColor: colors.positive },
    cardBad: { borderWidth: 1, borderColor: colors.negative },
    cardLabel: { color: colors.textSecondary, ...typography.label },
    cardValue: { color: colors.textPrimary, ...typography.bodyLarge },
    cardMuted: { color: colors.textMuted, ...typography.caption },
    actions: { flexDirection: 'row', gap: spacing.md },
    primaryButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      flexGrow: 1,
      marginTop: spacing.xs,
    },
    secondaryButton: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      flexGrow: 1,
      marginTop: spacing.xs,
    },
    primaryButtonText: { color: colors.textOnAccent, ...typography.label },
    disabled: { opacity: 0.5 },
    navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    navButton: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      flexBasis: '48%',
      flexGrow: 1,
    },
    navButtonText: { color: colors.textPrimary, ...typography.label },
    error: { color: colors.negative, ...typography.caption },
    leave: { alignItems: 'center', marginTop: spacing.lg },
    leaveText: { color: colors.textMuted, ...typography.caption },
  });
}
