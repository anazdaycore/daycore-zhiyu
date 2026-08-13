import { describe, expect, it } from 'vitest';
import { initialThemeAttr, isBuiltin } from './theme';

// The pure half of the theme logic. applyTheme itself writes to document, so it
// is exercised in the browser rather than under node.

describe('isBuiltin', () => {
  it('knows the four shipped papers', () => {
    expect(isBuiltin('sky')).toBe(true);
    expect(isBuiltin('sunset')).toBe(true);
    expect(isBuiltin('night')).toBe(true);
    expect(isBuiltin('nature')).toBe(true);
  });

  it('rejects custom ids', () => {
    expect(isBuiltin('custom-1')).toBe(false);
    expect(isBuiltin('')).toBe(false);
  });
});

describe('initialThemeAttr', () => {
  it('passes builtin ids through for the first paint', () => {
    expect(initialThemeAttr('night')).toBe('night');
  });

  it('falls back to sky when the session theme is a custom id', () => {
    expect(initialThemeAttr('theme_abc')).toBe('sky');
  });

  it('falls back to sky when nothing is set', () => {
    expect(initialThemeAttr(undefined)).toBe('sky');
  });
});
