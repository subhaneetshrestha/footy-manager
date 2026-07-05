/**
 * Basic transfer market (Phase-1 slice of §8): buy affordable listed players
 * while a window is open; AI clubs may also bid for your fringe players.
 */

import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  activeLoanFor,
  clubOf,
  loanCandidatesFrom,
  playerById,
  transferMarket,
  transferWindowFor,
} from '@footy/engine';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { formatMoney } from '../ui/format';
import { ratingColor, useTheme, type Theme } from '../ui/theme';

export function TransfersScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);
  const buyPlayer = useCareerStore((s) => s.buyPlayer);
  const loanOut = useCareerStore((s) => s.loanOutPlayer);
  const error = useCareerStore((s) => s.error);

  if (!world) {
    navigate('career');
    return null;
  }

  const club = clubOf(world, world.userClubId);
  const window = transferWindowFor(world.currentMatchday, world.totalMatchdays);
  const market = transferMarket(world, world.userClubId)
    .filter((p) => p.value <= club.budgetTransfer)
    .sort((a, b) => b.ovr - a.ovr || a.id - b.id)
    .slice(0, 60);

  const userTransfers = world.transfers
    .filter((t) => t.fromClubId === world.userClubId || t.toClubId === world.userClubId)
    .slice(-8)
    .reverse();
  const loanables = loanCandidatesFrom(world, world.userClubId);
  const userLoans = world.loans.filter(
    (l) => l.ownerClubId === world.userClubId || l.loanClubId === world.userClubId,
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigate('career')} hitSlop={12}>
          <Text style={styles.back}>‹ Career</Text>
        </Pressable>
        <Text style={styles.title}>Transfers</Text>
        <Text style={styles.sub}>
          {window ? `${window} window open` : 'window closed'} · budget{' '}
          {formatMoney(club.budgetTransfer)}
        </Text>
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>

      <FlatList
        data={market}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={
          <Text style={styles.section}>Affordable targets ({market.length})</Text>
        }
        ListFooterComponent={
          <View style={styles.log}>
            {loanables.length > 0 && (
              <>
                <Text style={styles.section}>Loanable youngsters ({loanables.length})</Text>
                {loanables.map((p) => (
                  <View key={p.id} style={styles.row}>
                    <Text style={styles.pos}>{p.position}</Text>
                    <View style={styles.nameBlock}>
                      <Text style={styles.name}>{p.name}</Text>
                      <Text style={styles.meta}>
                        {p.age} yrs · OVR {p.ovr} → POT {p.potential}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.buy, window === null && styles.buyDisabled]}
                      disabled={window === null}
                      onPress={() => loanOut(p.id)}
                    >
                      <Text style={styles.buyText}>Loan out</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
            {userLoans.length > 0 && (
              <>
                <Text style={styles.section}>Active loans</Text>
                {userLoans.map((l, i) => {
                  const player = playerById(world, l.playerId);
                  const out = l.ownerClubId === world.userClubId;
                  return (
                    <Text key={i} style={styles.logLine}>
                      {out ? 'OUT' : 'IN '} {player.name} ·{' '}
                      {out
                        ? `at ${clubOf(world, l.loanClubId).shortName}`
                        : `from ${clubOf(world, l.ownerClubId).shortName}`}
                      {l.optionToBuyFee !== null ? ` · option ${formatMoney(l.optionToBuyFee)}` : ''}
                    </Text>
                  );
                })}
              </>
            )}
            {userTransfers.length > 0 && (
              <>
                <Text style={styles.section}>Your club's business</Text>
                {userTransfers.map((t, i) => {
                  const player = playerById(world, t.playerId);
                  const incoming = t.toClubId === world.userClubId;
                  const other = incoming ? t.fromClubId : t.toClubId;
                  const otherName = other === 0 ? 'free agency' : clubOf(world, other).shortName;
                  return (
                    <Text key={i} style={styles.logLine}>
                      {incoming ? 'IN ' : 'OUT'} {player.name} · {formatMoney(t.fee)} ·{' '}
                      {incoming ? `from ${otherName}` : `to ${otherName}`}
                    </Text>
                  );
                })}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.pos}>{item.position}</Text>
            <View style={styles.nameBlock}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.clubId === 0 ? 'Free agent' : clubOf(world, item.clubId).shortName} ·{' '}
                {item.age} yrs · {formatMoney(item.value)}
              </Text>
            </View>
            <Text style={[styles.ovr, { color: ratingColor(theme, item.ovr) }]}>{item.ovr}</Text>
            <Pressable
              style={[styles.buy, window === null && styles.buyDisabled]}
              disabled={window === null}
              onPress={() => buyPlayer(item.id)}
            >
              <Text style={styles.buyText}>Buy</Text>
            </Pressable>
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
    header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xxs },
    back: { color: colors.textSecondary, ...typography.label },
    title: { color: colors.textPrimary, ...typography.heading },
    sub: { color: colors.textMuted, ...typography.caption },
    error: { color: colors.negative, ...typography.caption },
    section: {
      color: colors.textSecondary,
      ...typography.label,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.xxs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    pos: { color: colors.textSecondary, ...typography.label, width: 34 },
    nameBlock: { flex: 1 },
    name: { color: colors.textPrimary, ...typography.body },
    meta: { color: colors.textMuted, ...typography.caption },
    ovr: { ...typography.title, width: 30, textAlign: 'right' },
    buy: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    buyDisabled: { backgroundColor: colors.accentDisabled, opacity: 0.5 },
    buyText: { color: colors.textOnAccent, ...typography.label },
    log: { paddingBottom: spacing.xxl },
    logLine: {
      color: colors.textSecondary,
      ...typography.caption,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xxs,
    },
  });
}
