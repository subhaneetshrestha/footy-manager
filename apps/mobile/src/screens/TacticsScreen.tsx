/**
 * Tactics picker (requirements #4/#5/#6): formation + play style with a live
 * preview of team strength and the tactical profile the engine will consume.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  FORMATION_KEYS,
  clubOf,
  computeTacticalProfile,
  playerById,
  selectBestXi,
  teamStrength,
  type FormationKey,
} from '@footy/engine';
import { PLAY_STYLES, type PlayStyle } from '@footy/shared';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { useTheme, type Theme } from '../ui/theme';

const STYLE_LABELS: Record<PlayStyle, string> = {
  tiki_taka: 'Tiki-taka',
  gegenpressing: 'Gegenpressing',
  counter_attack: 'Counter-attack',
  park_the_bus: 'Park the bus',
  high_press: 'High press',
  wing_play: 'Wing play',
  direct: 'Direct',
  balanced: 'Balanced',
  tempo_control: 'Tempo control',
};

export function TacticsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);
  const setTactics = useCareerStore((s) => s.setTactics);

  if (!world) {
    navigate('career');
    return null;
  }

  const club = clubOf(world, world.userClubId);
  const squad = club.playerIds.map((id) => playerById(world, id));
  const xi = selectBestXi(squad, club.tactics.formation);
  const strength = teamStrength(xi);
  const profile = computeTacticalProfile(club.tactics.playStyle, xi);

  const pickFormation = (formation: FormationKey) => setTactics(formation, club.tactics.playStyle);
  const pickStyle = (style: PlayStyle) => setTactics(club.tactics.formation, style);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => navigate('career')} hitSlop={12}>
        <Text style={styles.back}>‹ Career</Text>
      </Pressable>
      <Text style={styles.title}>Tactics</Text>

      <Text style={styles.section}>Formation</Text>
      <View style={styles.chips}>
        {FORMATION_KEYS.map((formation) => (
          <Pressable
            key={formation}
            style={[styles.chip, club.tactics.formation === formation && styles.chipActive]}
            onPress={() => pickFormation(formation)}
          >
            <Text
              style={[
                styles.chipText,
                club.tactics.formation === formation && styles.chipTextActive,
              ]}
            >
              {formation}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Play style</Text>
      <View style={styles.chips}>
        {PLAY_STYLES.map((style) => (
          <Pressable
            key={style}
            style={[styles.chip, club.tactics.playStyle === style && styles.chipActive]}
            onPress={() => pickStyle(style)}
          >
            <Text
              style={[styles.chipText, club.tactics.playStyle === style && styles.chipTextActive]}
            >
              {STYLE_LABELS[style]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Match preview</Text>
      <View style={styles.card}>
        <PreviewRow label="Attack rating" value={strength.attack.toFixed(1)} theme={theme} />
        <PreviewRow label="Defence rating" value={strength.defence.toFixed(1)} theme={theme} />
        <PreviewRow
          label="System compatibility"
          value={`${Math.round(profile.compatibility * 100)}%`}
          theme={theme}
        />
        <PreviewRow
          label="Attacking intent"
          value={`${profile.attackMod > 1 ? '+' : ''}${Math.round((profile.attackMod - 1) * 100)}%`}
          theme={theme}
        />
        <PreviewRow
          label="Defensive solidity"
          value={`${profile.defenceMod < 1 ? '+' : ''}${Math.round((1 - profile.defenceMod) * 100)}%`}
          theme={theme}
        />
        <PreviewRow
          label="Expected possession"
          value={`${Math.round(profile.possessionShare * 100)}%`}
          theme={theme}
        />
      </View>
      <Text style={styles.hint}>
        Suitability follows your XI: suited players in a suited system materially improve results.
      </Text>
    </ScrollView>
  );
}

function PreviewRow({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.sm },
    back: { color: colors.textSecondary, ...typography.label },
    title: { color: colors.textPrimary, ...typography.heading },
    section: { color: colors.textSecondary, ...typography.label, marginTop: spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      backgroundColor: colors.surface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    chipActive: { backgroundColor: colors.accent },
    chipText: { color: colors.textSecondary, ...typography.label },
    chipTextActive: { color: colors.textOnAccent },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabel: { color: colors.textSecondary, ...typography.body },
    previewValue: { color: colors.textPrimary, ...typography.body },
    hint: { color: colors.textMuted, ...typography.caption, marginTop: spacing.sm },
  });
}
