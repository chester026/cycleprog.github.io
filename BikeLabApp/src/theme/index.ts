// Theme foundation — T-5.4 (audit A-27).
//
// A plain module constant (`theme`) is exposed through a hook (`useTheme`)
// and a `ThemeProvider`, so a future light-mode theme can be swapped in via
// context without touching any call site that already reads `useTheme()`.
import React, {createContext, useContext} from 'react';
import {StyleSheet} from 'react-native';
import {colors} from './colors';
import {spacing} from './spacing';
import {typography} from './typography';
import {radii} from './radii';
import {shadows} from './shadows';

export {colors, withOpacity} from './colors';
export {spacing} from './spacing';
export {typography} from './typography';
export {radii} from './radii';
export {shadows} from './shadows';

export const theme = {
  colors,
  spacing,
  typography,
  radii,
  shadows,
} as const;

export type Theme = typeof theme;

const ThemeContext = createContext<Theme>(theme);

/**
 * Mount once near the app root:
 *
 *   <ThemeProvider>
 *     <App />
 *   </ThemeProvider>
 *
 * Not required today (useTheme() falls back to the default `theme` via
 * context's default value), but wiring it now means a future light-mode
 * theme only has to change what this provider passes down.
 */
export const ThemeProvider: React.FC<{
  children: React.ReactNode;
  value?: Theme;
}> = ({children, value = theme}) => {
  return React.createElement(ThemeContext.Provider, {value}, children);
};

export const useTheme = (): Theme => useContext(ThemeContext);

/**
 * Typed `StyleSheet.create` helper — pass a function of `theme` returning a
 * style map, get back a `StyleSheet.create`-d object:
 *
 *   const styles = makeStyles(theme => ({
 *     card: {backgroundColor: theme.colors.surfaceElevated},
 *   }));
 *
 * Generic constraint mirrors `StyleSheet.create`'s own signature so style
 * literal types (e.g. `flexDirection: 'row'`) aren't widened to `string`.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  fn: (t: Theme) => T,
): T {
  return StyleSheet.create(fn(theme));
}
