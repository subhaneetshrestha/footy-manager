/**
 * Design-system integrity: every semantic slot filled with a valid color in
 * both schemes, scales monotone, rating bands correct. Pure-TS parts only
 * (no react-native imports in these modules).
 */

import { describe, expect, it } from 'vitest';
import { palette, radius, spacing, typography } from '../src/ui/theme/tokens';
import { darkTheme, lightTheme, ratingColor, type Theme } from '../src/ui/theme/themes';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('primitive tokens', () => {
  it('every palette entry is a valid #rrggbb hex', () => {
    for (const scale of Object.values(palette)) {
      for (const hex of Object.values(scale)) {
        expect(hex).toMatch(HEX);
      }
    }
  });

  it('spacing scale is strictly increasing', () => {
    const order = [
      spacing.xxs,
      spacing.xs,
      spacing.sm,
      spacing.md,
      spacing.lg,
      spacing.xl,
      spacing.xxl,
      spacing.xxxl,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    }
  });

  it('radius scale is strictly increasing', () => {
    expect(radius.md).toBeGreaterThan(radius.sm);
    expect(radius.lg).toBeGreaterThan(radius.md);
    expect(radius.pill).toBeGreaterThan(radius.lg);
  });

  it('every type style has a line height at least its font size', () => {
    for (const style of Object.values(typography)) {
      expect(style.fontSize).toBeGreaterThan(0);
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
    }
  });
});

describe('semantic themes', () => {
  const themes: Theme[] = [darkTheme, lightTheme];

  it('every semantic color slot is a valid hex in both schemes', () => {
    for (const theme of themes) {
      for (const [slot, value] of Object.entries(theme.colors)) {
        expect(value, `${theme.scheme}.${slot}`).toMatch(HEX);
      }
    }
  });

  it('dark and light actually differ where it matters', () => {
    expect(darkTheme.colors.background).not.toBe(lightTheme.colors.background);
    expect(darkTheme.colors.textPrimary).not.toBe(lightTheme.colors.textPrimary);
    expect(darkTheme.colors.surface).not.toBe(lightTheme.colors.surface);
  });

  it('both schemes share the same token scales (single source of truth)', () => {
    expect(darkTheme.spacing).toBe(lightTheme.spacing);
    expect(darkTheme.radius).toBe(lightTheme.radius);
    expect(darkTheme.typography).toBe(lightTheme.typography);
  });
});

describe('ratingColor bands (0-99 attribute scale)', () => {
  it('maps values to the right band including boundaries', () => {
    const t = darkTheme;
    expect(ratingColor(t, 99)).toBe(t.colors.ratingElite);
    expect(ratingColor(t, 85)).toBe(t.colors.ratingElite);
    expect(ratingColor(t, 84)).toBe(t.colors.ratingGreat);
    expect(ratingColor(t, 75)).toBe(t.colors.ratingGreat);
    expect(ratingColor(t, 74)).toBe(t.colors.ratingGood);
    expect(ratingColor(t, 65)).toBe(t.colors.ratingGood);
    expect(ratingColor(t, 64)).toBe(t.colors.ratingAverage);
    expect(ratingColor(t, 50)).toBe(t.colors.ratingAverage);
    expect(ratingColor(t, 49)).toBe(t.colors.ratingPoor);
    expect(ratingColor(t, 0)).toBe(t.colors.ratingPoor);
  });
});
