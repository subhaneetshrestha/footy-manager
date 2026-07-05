/** Squad roster: OVR-color-coded list of the user club's players. */

import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { clubOf, playerById } from '@footy/engine';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { formatMoney } from '../ui/format';
import { ratingColor, useTheme, type Theme } from '../ui/theme';

export function SquadScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);

  if (!world) {
    navigate('career');
    return null;
  }

  const club = clubOf(world, world.userClubId);
  const squad = club.playerIds
    .map((id) => playerById(world, id))
    .sort((a, b) => b.ovr - a.ovr || a.id - b.id);
  const avgOvr = squad.reduce((sum, p) => sum + p.ovr, 0) / squad.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigate('career')} hitSlop={12}>
          <Text style={styles.back}>‹ Career</Text>
        </Pressable>
        <Text style={styles.title}>Squad</Text>
        <Text style={styles.sub}>
          {squad.length} players · avg OVR {avgOvr.toFixed(1)}
        </Text>
      </View>
      <FlatList
        data={squad}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.pos}>{item.position}</Text>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.age} yrs · {formatMoney(item.value)} · {formatMoney(item.wage)}/wk
              </Text>
            </View>
            <Text style={[styles.ovr, { color: ratingColor(theme, item.ovr) }]}>{item.ovr}</Text>
          </View>
        )}
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
    sub: { color: colors.textMuted, ...typography.caption },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.xxs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    pos: { color: colors.textSecondary, ...typography.label, width: 36 },
    nameBlock: { flex: 1 },
    name: { color: colors.textPrimary, ...typography.body },
    meta: { color: colors.textMuted, ...typography.caption },
    ovr: { ...typography.title, width: 34, textAlign: 'right' },
  });
}
