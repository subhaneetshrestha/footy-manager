/**
 * SEMANTIC themes — what components actually consume.
 * Every color has a meaning-based name; components never reference palette
 * scales or hex values. Add a new theme by mapping primitives to these slots.
 */

import { palette, radius, spacing, typography } from './tokens';

export interface ThemeColors {
  /** Screen background. */
  background: string;
  /** Cards, list rows, sheets. */
  surface: string;
  /** Elevated surfaces (modals, menus). */
  surfaceRaised: string;
  border: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Text/icons placed on accent-colored fills. */
  textOnAccent: string;

  /** Primary interactive color (buttons, links, active tabs). */
  accent: string;
  accentPressed: string;
  accentDisabled: string;

  positive: string;
  warning: string;
  negative: string;
  info: string;

  /** Match results. */
  win: string;
  draw: string;
  loss: string;

  /** 0-99 attribute/OVR bands, worst → best. */
  ratingPoor: string;
  ratingAverage: string;
  ratingGood: string;
  ratingGreat: string;
  ratingElite: string;
}

export interface Theme {
  scheme: 'dark' | 'light';
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: {
    background: palette.green[800],
    surface: palette.green[700],
    surfaceRaised: palette.neutral[700],
    border: palette.neutral[600],

    textPrimary: palette.neutral[100],
    textSecondary: palette.neutral[400],
    textMuted: palette.neutral[500],
    textOnAccent: palette.neutral[100],

    accent: palette.green[600],
    accentPressed: palette.green[500],
    accentDisabled: palette.green[700],

    positive: palette.green[400],
    warning: palette.amber[400],
    negative: palette.red[400],
    info: palette.blue[400],

    win: palette.green[400],
    draw: palette.neutral[400],
    loss: palette.red[400],

    ratingPoor: palette.red[400],
    ratingAverage: palette.amber[400],
    ratingGood: palette.green[300],
    ratingGreat: palette.green[400],
    ratingElite: palette.gold[400],
  },
  spacing,
  radius,
  typography,
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: {
    background: palette.neutral[50],
    surface: palette.neutral[100],
    surfaceRaised: '#ffffff',
    border: palette.neutral[200],

    textPrimary: palette.neutral[900],
    textSecondary: palette.neutral[600],
    textMuted: palette.neutral[500],
    textOnAccent: palette.neutral[100],

    accent: palette.green[600],
    accentPressed: palette.green[700],
    accentDisabled: palette.green[200],

    positive: palette.green[500],
    warning: palette.amber[500],
    negative: palette.red[500],
    info: palette.blue[500],

    win: palette.green[500],
    draw: palette.neutral[500],
    loss: palette.red[500],

    ratingPoor: palette.red[500],
    ratingAverage: palette.amber[500],
    ratingGood: palette.green[400],
    ratingGreat: palette.green[500],
    ratingElite: palette.gold[500],
  },
  spacing,
  radius,
  typography,
};

/** Attribute/OVR value (0-99) → its rating band color. */
export function ratingColor(theme: Theme, value: number): string {
  if (value >= 85) return theme.colors.ratingElite;
  if (value >= 75) return theme.colors.ratingGreat;
  if (value >= 65) return theme.colors.ratingGood;
  if (value >= 50) return theme.colors.ratingAverage;
  return theme.colors.ratingPoor;
}
