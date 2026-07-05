/**
 * PRIMITIVE design tokens — the single place raw values live.
 * Nothing in the app imports these directly except themes.ts: screens and
 * components consume the SEMANTIC theme (useTheme()), so restyling the whole
 * app means editing this file only.
 */

/** Base color scales (10 = darkest, 0 = lightest). */
export const palette = {
  /** Brand green — the pitch. */
  green: {
    900: '#07130c',
    800: '#0b1d12',
    700: '#123324',
    600: '#1d5c33',
    500: '#2a7a45',
    400: '#3f9c5d',
    300: '#63b97e',
    200: '#9dd5ae',
    100: '#d7efdd',
    50: '#eff8f1',
  },
  neutral: {
    900: '#0d0f0e',
    800: '#1a1d1b',
    700: '#2a2e2c',
    600: '#454b48',
    500: '#5c7a66',
    400: '#8fae98',
    300: '#b9ccbf',
    200: '#dbe6de',
    100: '#f2f7f3',
    50: '#fafcfa',
  },
  gold: {
    600: '#8a6d1a',
    500: '#c19a2e',
    400: '#e0b94a',
    300: '#eed389',
  },
  red: {
    600: '#8c2323',
    500: '#c03434',
    400: '#e05252',
    300: '#f09a9a',
  },
  amber: {
    500: '#c77e1e',
    400: '#e89b35',
    300: '#f4c377',
  },
  blue: {
    600: '#1e4e79',
    500: '#2e6ea6',
    400: '#4b8fc9',
    300: '#93bede',
  },
} as const;

/** 4pt spacing scale. Use these, never raw numbers, for margins/paddings/gaps. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;
export type SpacingToken = keyof typeof spacing;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;
export type RadiusToken = keyof typeof radius;

/** Type scale. Pair size+lineHeight together; don't invent sizes in screens. */
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  bodyLarge: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;
export type TypographyToken = keyof typeof typography;
