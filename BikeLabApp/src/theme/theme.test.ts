// Token snapshot / shape test — T-5.4 (audit A-27).
import {theme, colors, withOpacity} from './index';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_RE = /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/;

function isValidColor(value: unknown): boolean {
  return typeof value === 'string' && (HEX_RE.test(value) || RGBA_RE.test(value));
}

function collectColorValues(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(v => collectColorValues(v, out));
  }
  return out;
}

describe('theme', () => {
  it('exports the expected top-level structure', () => {
    expect(theme).toMatchObject({
      colors: expect.any(Object),
      spacing: expect.any(Object),
      typography: expect.any(Object),
      radii: expect.any(Object),
      shadows: expect.any(Object),
    });
  });

  it('matches the color token snapshot', () => {
    expect(theme.colors).toMatchSnapshot();
  });

  it('every color token is a valid hex or rgba string', () => {
    const values = collectColorValues(colors);
    expect(values.length).toBeGreaterThan(0);
    values.forEach(value => {
      expect(isValidColor(value)).toBe(true);
    });
  });

  it('required semantic color tokens are present', () => {
    expect(colors.background).toBeDefined();
    expect(colors.surface).toBeDefined();
    expect(colors.surfaceElevated).toBeDefined();
    expect(colors.border).toBeDefined();
    expect(colors.text.primary).toBeDefined();
    expect(colors.text.secondary).toBeDefined();
    expect(colors.text.muted).toBeDefined();
    expect(colors.text.inverse).toBeDefined();
    expect(colors.accent).toBeDefined();
    expect(colors.success).toBeDefined();
    expect(colors.warning).toBeDefined();
    expect(colors.danger).toBeDefined();
    expect(colors.chart.series1).toBeDefined();
    expect(colors.chart.series2).toBeDefined();
    expect(colors.chart.series3).toBeDefined();
    expect(colors.chart.series4).toBeDefined();
    expect(colors.chart.series5).toBeDefined();
    expect(colors.chart.series6).toBeDefined();
  });

  it('withOpacity converts hex to the exact rgba format used across the app', () => {
    expect(withOpacity('#1a1a1a', 0.7)).toBe('rgba(26, 26, 26, 0.7)');
    expect(withOpacity('#fff', 0.8)).toBe('rgba(255, 255, 255, 0.8)');
    expect(withOpacity('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});
