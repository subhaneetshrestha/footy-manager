/** League table with the user club highlighted. */

import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { clubOf, leagueTable } from '@footy/engine';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { useTheme, type Theme } from '../ui/theme';

export function TableScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);

  if (!world) {
    navigate('career');
    return null;
  }

  const rows = leagueTable(world, 1);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigate('career')} hitSlop={12}>
          <Text style={styles.back}>‹ Career</Text>
        </Pressable>
        <Text style={styles.title}>{world.leagues[0]?.name}</Text>
      </View>
      <View style={styles.headRow}>
        <Text style={[styles.cellPos, styles.headText]}>#</Text>
        <Text style={[styles.cellName, styles.headText]}>Club</Text>
        <Text style={[styles.cell, styles.headText]}>P</Text>
        <Text style={[styles.cell, styles.headText]}>W</Text>
        <Text style={[styles.cell, styles.headText]}>D</Text>
        <Text style={[styles.cell, styles.headText]}>L</Text>
        <Text style={[styles.cellWide, styles.headText]}>GD</Text>
        <Text style={[styles.cellWide, styles.headText]}>Pts</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.clubId)}
        renderItem={({ item, index }) => {
          const isUser = item.clubId === world.userClubId;
          return (
            <View style={[styles.row, isUser && styles.rowUser]}>
              <Text style={[styles.cellPos, styles.text]}>{index + 1}</Text>
              <Text style={[styles.cellName, styles.text]} numberOfLines={1}>
                {clubOf(world, item.clubId).shortName}
              </Text>
              <Text style={[styles.cell, styles.text]}>{item.played}</Text>
              <Text style={[styles.cell, styles.text]}>{item.won}</Text>
              <Text style={[styles.cell, styles.text]}>{item.drawn}</Text>
              <Text style={[styles.cell, styles.text]}>{item.lost}</Text>
              <Text style={[styles.cellWide, styles.text]}>
                {item.goalDifference > 0 ? `+${item.goalDifference}` : item.goalDifference}
              </Text>
              <Text style={[styles.cellWide, styles.points]}>{item.points}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.xxl },
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xxs },
    back: { color: colors.textSecondary, ...typography.label },
    title: { color: colors.textPrimary, ...typography.heading },
    headRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
    },
    headText: { color: colors.textMuted, ...typography.caption },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
      marginHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    rowUser: { backgroundColor: colors.surface },
    text: { color: colors.textPrimary, ...typography.caption },
    points: { color: colors.textPrimary, ...typography.label },
    cellPos: { width: 24 },
    cellName: { flex: 1 },
    cell: { width: 26, textAlign: 'right' },
    cellWide: { width: 36, textAlign: 'right' },
  });
}
