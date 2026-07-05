/**
 * App shell (§10): theme provider + screen routing via the app store.
 * All colors/spacing/type come from the theme (src/ui/theme) — no raw values.
 */

import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SAVE_SLOT_COUNT } from '@footy/shared';
import { listSaves, type SaveSlotMeta } from './src/db/saves';
import { ClubSelectScreen } from './src/screens/ClubSelectScreen';
import { CareerScreen } from './src/screens/CareerScreen';
import { SquadScreen } from './src/screens/SquadScreen';
import { StaffScreen } from './src/screens/StaffScreen';
import { MatchScreen } from './src/screens/MatchScreen';
import { FinancesScreen } from './src/screens/FinancesScreen';
import { TacticsScreen } from './src/screens/TacticsScreen';
import { TableScreen } from './src/screens/TableScreen';
import { TransfersScreen } from './src/screens/TransfersScreen';
import { useAppStore } from './src/state/appStore';
import { ThemeProvider, useTheme, type Theme } from './src/ui/theme';

function MainMenu() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigate = useAppStore((s) => s.navigate);
  const [saves, setSaves] = useState<SaveSlotMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSaves()
      .then(setSaves)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const hasSaves = (saves?.length ?? 0) > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Footy Manager</Text>
      <Text style={styles.subtitle}>Phase 0 — foundations</Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => navigate('club_select')}
      >
        <Text style={styles.buttonText}>New Game</Text>
      </Pressable>
      <Pressable style={[styles.button, !hasSaves && styles.buttonDisabled]} disabled={!hasSaves}>
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>

      <Text style={styles.footer}>
        {error
          ? `save index unavailable here (${SAVE_SLOT_COUNT} slots on device)`
          : saves === null
            ? 'reading save index…'
            : `${saves.length}/${SAVE_SLOT_COUNT} save slots used`}
      </Text>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    title: { color: colors.textPrimary, ...typography.display },
    subtitle: {
      color: colors.textSecondary,
      ...typography.body,
      marginBottom: spacing.xl,
    },
    button: {
      backgroundColor: colors.accent,
      paddingHorizontal: spacing.xxxl,
      paddingVertical: spacing.lg,
      borderRadius: radius.md,
      minWidth: 240,
      alignItems: 'center',
    },
    buttonPressed: { backgroundColor: colors.accentPressed },
    buttonDisabled: { backgroundColor: colors.accentDisabled, opacity: 0.6 },
    buttonText: { color: colors.textOnAccent, ...typography.title },
    footer: { color: colors.textMuted, ...typography.caption, marginTop: spacing.xxl },
  });
}

function Router() {
  const theme = useTheme();
  const screen = useAppStore((s) => s.screen);
  return (
    <>
      {screen === 'club_select' ? (
        <ClubSelectScreen />
      ) : screen === 'career' ? (
        <CareerScreen />
      ) : screen === 'squad' ? (
        <SquadScreen />
      ) : screen === 'tactics' ? (
        <TacticsScreen />
      ) : screen === 'table' ? (
        <TableScreen />
      ) : screen === 'transfers' ? (
        <TransfersScreen />
      ) : screen === 'staff' ? (
        <StaffScreen />
      ) : screen === 'match' ? (
        <MatchScreen />
      ) : screen === 'finances' ? (
        <FinancesScreen />
      ) : (
        <MainMenu />
      )}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router />
    </ThemeProvider>
  );
}
