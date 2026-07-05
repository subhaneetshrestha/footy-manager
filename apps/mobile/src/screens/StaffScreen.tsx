/**
 * Staff department (requirements #7/#8/#11): current coaching staff with
 * department + style ratings, hiring market within the staff wage budget,
 * fire buttons, and the auto-manage fill.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  clubOf,
  freeAgentStaff,
  meanStaffRating,
  roleFilled,
  staffOf,
  staffWageBill,
  type WorldStaff,
} from '@footy/engine';
import type { StaffRole } from '@footy/shared';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { formatMoney } from '../ui/format';
import { ratingColor, useTheme, type Theme } from '../ui/theme';

const ROLE_LABELS: Record<StaffRole, string> = {
  manager: 'Manager',
  gk_coach: 'GK coach',
  def_coach: 'Defence coach',
  mid_coach: 'Midfield coach',
  att_coach: 'Attack coach',
  set_piece: 'Set pieces',
  fitness: 'Fitness',
  physio: 'Physio',
  analyst: 'Analyst',
  scout: 'Scout',
  youth: 'Youth coach',
};

export function StaffScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);
  const hire = useCareerStore((s) => s.hireStaffMember);
  const fire = useCareerStore((s) => s.fireStaffMember);
  const autoFill = useCareerStore((s) => s.autoFillStaffRoles);
  const error = useCareerStore((s) => s.error);

  if (!world) {
    navigate('career');
    return null;
  }

  const club = clubOf(world, world.userClubId);
  const bill = staffWageBill(world, world.userClubId);
  const budgetLeft = club.budgetStaffWage - bill;
  const ownStaff = staffOf(world, world.userClubId);
  const market = freeAgentStaff(world)
    .filter((s) => s.wage <= budgetLeft && !roleFilled(world, world.userClubId, s.role))
    .sort((a, b) => meanStaffRating(b) - meanStaffRating(a) || a.id - b.id)
    .slice(0, 30);

  const staffRow = (member: WorldStaff, action: 'fire' | 'hire') => {
    const styleRating = member.playstyleRatings[club.tactics.playStyle];
    return (
      <View key={member.id} style={styles.row}>
        <View style={styles.nameBlock}>
          <Text style={styles.name}>
            {ROLE_LABELS[member.role]} · {member.name}
          </Text>
          <Text style={styles.meta}>
            GK {member.ratingGk} · DEF {member.ratingDef} · MID {member.ratingMid} · ATT{' '}
            {member.ratingAtt} · style fit {styleRating}/10 · {formatMoney(member.wage)}/wk
          </Text>
        </View>
        <Text style={[styles.rating, { color: ratingColor(theme, meanStaffRating(member) * 10) }]}>
          {meanStaffRating(member).toFixed(1)}
        </Text>
        <Pressable
          style={[styles.action, action === 'fire' && styles.actionDanger]}
          onPress={() => (action === 'fire' ? fire(member.id) : hire(member.id))}
        >
          <Text style={styles.actionText}>{action === 'fire' ? 'Fire' : 'Hire'}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => navigate('career')} hitSlop={12}>
        <Text style={styles.back}>‹ Career</Text>
      </Pressable>
      <Text style={styles.title}>Staff</Text>
      <Text style={styles.sub}>
        Wage bill {formatMoney(bill)}/wk of {formatMoney(club.budgetStaffWage)}/wk budget ·
        facilities {club.trainingFacilities}/20
      </Text>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.autoFill} onPress={autoFill}>
        <Text style={styles.autoFillText}>Auto-fill vacant roles (delegate)</Text>
      </Pressable>

      <Text style={styles.section}>Your staff ({ownStaff.length})</Text>
      {ownStaff.map((member) => staffRow(member, 'fire'))}

      <Text style={styles.section}>Available to hire ({market.length})</Text>
      {market.map((member) => staffRow(member, 'hire'))}
      {market.length === 0 && (
        <Text style={styles.meta}>
          No affordable free agents for your vacant roles right now.
        </Text>
      )}
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.xs },
    back: { color: colors.textSecondary, ...typography.label },
    title: { color: colors.textPrimary, ...typography.heading },
    sub: { color: colors.textMuted, ...typography.caption },
    error: { color: colors.negative, ...typography.caption },
    section: { color: colors.textSecondary, ...typography.label, marginTop: spacing.md },
    autoFill: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    autoFillText: { color: colors.textOnAccent, ...typography.label },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      marginVertical: spacing.xxs,
    },
    nameBlock: { flex: 1 },
    name: { color: colors.textPrimary, ...typography.body },
    meta: { color: colors.textMuted, ...typography.caption },
    rating: { ...typography.title, width: 40, textAlign: 'right' },
    action: {
      backgroundColor: colors.accent,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    actionDanger: { backgroundColor: colors.surfaceRaised },
    actionText: { color: colors.textOnAccent, ...typography.label },
  });
}
