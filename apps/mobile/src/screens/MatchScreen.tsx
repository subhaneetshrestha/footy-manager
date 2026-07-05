/**
 * Match-day playback (§6): replays the pre-generated Tier-A timeline — the
 * sim never runs during render. RN-View pitch for now (DECISIONS.md D8: the
 * Skia renderer lands with the device milestone and its 60fps gate).
 */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clubOf, commentFor, playerById, type MatchEvent } from '@footy/engine';
import { useAppStore } from '../state/appStore';
import { useCareerStore } from '../state/careerStore';
import { useTheme, type Theme } from '../ui/theme';

const BASE_TICK_MS = 260;

export function MatchScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const world = useCareerStore((s) => s.world);
  const match = useCareerStore((s) => s.liveMatch);
  const dismissMatch = useCareerStore((s) => s.dismissMatch);

  const [index, setIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);

  const done = match !== null && index >= match.events.length - 1;

  useEffect(() => {
    if (match === null || paused || done) return;
    const timer = setInterval(
      () => setIndex((i) => Math.min(i + 1, match.events.length - 1)),
      BASE_TICK_MS / speed,
    );
    return () => clearInterval(timer);
  }, [match, paused, speed, done]);

  if (!world || !match) {
    navigate('career');
    return null;
  }

  const fixture = world.fixtures[match.fixtureId - 1]!;
  const homeClub = clubOf(world, fixture.homeClubId);
  const awayClub = clubOf(world, fixture.awayClubId);
  const ctx = {
    homeName: homeClub.shortName,
    awayName: awayClub.shortName,
    playerName: (id: number) => playerById(world, id).name,
  };

  const view = useMemo(() => {
    let homeGoals = 0;
    let awayGoals = 0;
    let shotsHome = 0;
    let shotsAway = 0;
    let onTargetHome = 0;
    let onTargetAway = 0;
    let xgHome = 0;
    let xgAway = 0;
    let possHome = 0;
    let possTotal = 0;
    const lines: string[] = [];
    for (let i = 0; i <= index; i++) {
      const event = match.events[i]!;
      if (event.type === 'goal') {
        if (event.side === 'home') homeGoals++;
        else awayGoals++;
      }
      if (event.type === 'shot') {
        if (event.side === 'home') {
          shotsHome++;
          xgHome += event.xg ?? 0;
        } else {
          shotsAway++;
          xgAway += event.xg ?? 0;
        }
      }
      if (event.type === 'goal' || event.type === 'save') {
        if (event.side === 'home') onTargetHome++;
        else onTargetAway++;
      }
      if (event.type === 'pass' || event.type === 'carry') {
        possTotal++;
        if (event.side === 'home') possHome++;
      }
      const line = commentFor(event, i, ctx);
      if (line !== null) lines.push(`${event.minute}' ${line}`);
    }
    const current = match.events[index]!;
    return {
      current,
      homeGoals,
      awayGoals,
      shotsHome,
      shotsAway,
      onTargetHome,
      onTargetAway,
      xgHome,
      xgAway,
      possession: possTotal === 0 ? 50 : Math.round((possHome / possTotal) * 100),
      lines: lines.slice(-4).reverse(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, match]);

  const finish = () => {
    dismissMatch();
    navigate('career');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.scoreRow}>
        <Text style={styles.teamName} numberOfLines={1}>
          {homeClub.shortName}
        </Text>
        <Text style={styles.score}>
          {view.homeGoals} – {view.awayGoals}
        </Text>
        <Text style={[styles.teamName, styles.right]} numberOfLines={1}>
          {awayClub.shortName}
        </Text>
      </View>
      <Text style={styles.clock}>
        {done ? 'Full time' : `${Math.min(view.current.minute, 90)}'`}
      </Text>

      <View style={styles.pitch}>
        <View style={styles.halfLine} />
        <View style={styles.centerCircle} />
        <View style={[styles.box, styles.boxLeft]} />
        <View style={[styles.box, styles.boxRight]} />
        <View
          style={[
            styles.ball,
            {
              left: `${view.current.x * 100}%`,
              top: `${view.current.y * 100}%`,
              backgroundColor:
                view.current.side === 'home' ? homeClub.colorPrimary : awayClub.colorPrimary,
            },
          ]}
        />
        {view.current.type === 'goal' && <Text style={styles.goalFlash}>GOAL!</Text>}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Possession" home={`${view.possession}%`} away={`${100 - view.possession}%`} theme={theme} />
        <Stat label="Shots" home={String(view.shotsHome)} away={String(view.shotsAway)} theme={theme} />
        <Stat label="On target" home={String(view.onTargetHome)} away={String(view.onTargetAway)} theme={theme} />
        <Stat label="xG" home={view.xgHome.toFixed(2)} away={view.xgAway.toFixed(2)} theme={theme} />
      </View>

      <View style={styles.commentary}>
        {view.lines.map((line, i) => (
          <Text key={i} style={i === 0 ? styles.commentLatest : styles.comment}>
            {line}
          </Text>
        ))}
      </View>

      <View style={styles.controls}>
        {done ? (
          <Pressable style={styles.primary} onPress={finish}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.control} onPress={() => setPaused((p) => !p)}>
              <Text style={styles.controlText}>{paused ? 'Resume' : 'Pause'}</Text>
            </Pressable>
            <Pressable
              style={styles.control}
              onPress={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            >
              <Text style={styles.controlText}>{speed}x</Text>
            </Pressable>
            <Pressable
              style={styles.control}
              onPress={() => setIndex(match.events.length - 1)}
            >
              <Text style={styles.controlText}>Skip to FT</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Stat({
  label,
  home,
  away,
  theme,
}: {
  label: string;
  home: string;
  away: string;
  theme: Theme;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{home}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{away}</Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    teamName: { flex: 1, color: colors.textPrimary, ...typography.title },
    right: { textAlign: 'right' },
    score: { color: colors.textPrimary, ...typography.display },
    clock: { color: colors.textSecondary, ...typography.label, textAlign: 'center' },
    pitch: {
      aspectRatio: 105 / 68,
      backgroundColor: '#17542b',
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: '#2c7a44',
      overflow: 'hidden',
    },
    halfLine: {
      position: 'absolute',
      left: '50%',
      top: 0,
      bottom: 0,
      width: 2,
      backgroundColor: '#2c7a44',
    },
    centerCircle: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 70,
      height: 70,
      marginLeft: -35,
      marginTop: -35,
      borderRadius: 35,
      borderWidth: 2,
      borderColor: '#2c7a44',
    },
    box: {
      position: 'absolute',
      top: '28%',
      bottom: '28%',
      width: '14%',
      borderWidth: 2,
      borderColor: '#2c7a44',
    },
    boxLeft: { left: -2 },
    boxRight: { right: -2 },
    ball: {
      position: 'absolute',
      width: 14,
      height: 14,
      marginLeft: -7,
      marginTop: -7,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: '#ffffff',
    },
    goalFlash: {
      position: 'absolute',
      alignSelf: 'center',
      top: '38%',
      color: '#ffffff',
      ...typography.display,
    },
    statsRow: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    stat: { flexDirection: 'row', justifyContent: 'space-between' },
    statValue: { color: colors.textPrimary, ...typography.label, width: 60 },
    statLabel: { color: colors.textMuted, ...typography.caption },
    commentary: { gap: spacing.xs, minHeight: 88 },
    commentLatest: { color: colors.textPrimary, ...typography.body },
    comment: { color: colors.textMuted, ...typography.caption },
    controls: { flexDirection: 'row', gap: spacing.sm },
    control: {
      flexGrow: 1,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    controlText: { color: colors.textPrimary, ...typography.label },
    primary: {
      flexGrow: 1,
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    primaryText: { color: colors.textOnAccent, ...typography.label },
  });
}
