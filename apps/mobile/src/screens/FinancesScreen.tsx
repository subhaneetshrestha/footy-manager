/** Deep finances (§8 Phase 6): last season's books, budgets, FFP status. */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clubOf, managerReputationOf } from '@footy/engine';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { formatMoney } from '../ui/format';
import { useTheme, type Theme } from '../ui/theme';

export function FinancesScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);

  if (!world) {
    navigate('career');
    return null;
  }

  const club = clubOf(world, world.userClubId);
  const books = club.books;

  const Row = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <View style={styles.row}>
      <Text style={strong ? styles.rowLabelStrong : styles.rowLabel}>{label}</Text>
      <Text style={[strong ? styles.rowValueStrong : styles.rowValue, value < 0 && styles.neg]}>
        {value < 0 ? `-${formatMoney(-value)}` : formatMoney(value)}
      </Text>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => navigate('career')} hitSlop={12}>
        <Text style={styles.back}>‹ Career</Text>
      </Pressable>
      <Text style={styles.title}>Finances</Text>
      <Text style={styles.sub}>
        Balance {formatMoney(club.balance)} · manager reputation {managerReputationOf(world)}
        {club.transferEmbargo === true ? ' · FFP TRANSFER EMBARGO' : ''}
      </Text>

      <View style={styles.card}>
        <Text style={styles.section}>Budgets</Text>
        <Row label="Transfer budget" value={club.budgetTransfer} />
        <Row label="Wage budget (weekly)" value={club.budgetWage} />
        <Row label="Staff wage budget (weekly)" value={club.budgetStaffWage} />
      </View>

      {books === undefined ? (
        <Text style={styles.hint}>
          The first set of season books arrives when this season ends.
        </Text>
      ) : (
        <View style={styles.card}>
          <Text style={styles.section}>
            Season {books.season}/{(books.season + 1) % 100} books — finished{' '}
            {books.finalPosition}
            {ordinalSuffix(books.finalPosition)}
          </Text>
          <Row label="Gate receipts" value={books.revenueGate} />
          <Row label="TV money" value={books.revenueTv} />
          <Row label="Sponsorship" value={books.revenueSponsor} />
          <Row label="Prize money" value={books.revenuePrize} />
          <Row label="Player sales" value={books.revenueTransfers} />
          <Row label="Player wages" value={-books.expenseWages} />
          <Row label="Staff wages" value={-books.expenseStaffWages} />
          <Row label="Transfer spend" value={-books.expenseTransfers} />
          <Row label="Operations" value={-books.expenseOperating} />
          <Row label="Net result" value={books.net} strong />
          {(club.ffpStrikes ?? 0) > 0 && (
            <Text style={styles.warning}>
              FFP warning: {club.ffpStrikes} consecutive loss season
              {(club.ffpStrikes ?? 0) > 1 ? 's' : ''} — a second strike triggers a transfer
              embargo.
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function ordinalSuffix(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return 'st';
  if (rem10 === 2 && rem100 !== 12) return 'nd';
  if (rem10 === 3 && rem100 !== 13) return 'rd';
  return 'th';
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
    back: { color: colors.textSecondary, ...typography.label },
    title: { color: colors.textPrimary, ...typography.heading },
    sub: { color: colors.textMuted, ...typography.caption },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    section: { color: colors.textSecondary, ...typography.label, marginBottom: spacing.xs },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    rowLabel: { color: colors.textSecondary, ...typography.body },
    rowValue: { color: colors.textPrimary, ...typography.body },
    rowLabelStrong: { color: colors.textPrimary, ...typography.title },
    rowValueStrong: { color: colors.positive, ...typography.title },
    neg: { color: colors.negative },
    warning: { color: colors.warning, ...typography.caption, marginTop: spacing.sm },
    hint: { color: colors.textMuted, ...typography.caption },
  });
}
