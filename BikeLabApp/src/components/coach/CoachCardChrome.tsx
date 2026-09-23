import React from 'react';
import {Text, TouchableOpacity, View, ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {colors, makeStyles} from '../../theme';

// Shared visual language for every rich card the coach renders in chat —
// ported from the "Rich Chat Cards v2" style reference (uploaded design
// mockup): soft gradient surface, a tinted glow band fading from the top,
// a hairline border, a diffuse shadow, and a small set of reusable pieces
// (icon tile, eyebrow label, status pill, footer link, divider) so every
// card type — goal/calendar/score/chart/comparison/skills — reads as one
// family instead of each one inventing its own look.
//
// Shadow is applied on the OUTER wrapper (no overflow:hidden there) while
// the border/radius/gradient/glow-clip live on the INNER view — putting a
// shadow and `overflow:hidden` on the same view clips the shadow on iOS.

export const CARD_RADIUS = 16;

export interface AccentTheme {
  icon: string;
  tint: string;
  glow: string;
  border: string;
  gradTop: string;
}

export const ACCENT: Record<'blue' | 'green' | 'amber' | 'orange' | 'red' | 'purple' | 'gray', AccentTheme> =
  colors.coach.accents;

export const CoachCard: React.FC<{
  accent?: AccentTheme;
  glow?: boolean;
  glowHeight?: number;
  onPress?: () => void;
  style?: ViewStyle;
  wrapperStyle?: ViewStyle;
  testID?: string;
  children: React.ReactNode;
}> = ({accent = ACCENT.gray, glow = true, glowHeight = 64, onPress, style, wrapperStyle, testID, children}) => {
  const inner = (
    <LinearGradient
      colors={[accent.gradTop, colors.coach.cardGradientEnd]}
      style={[styles.card, {borderColor: accent.border}, style]}>
      {glow ? <LinearGradient
          colors={[accent.glow, 'rgba(255,255,255,0)']}
          style={[styles.glow, {height: glowHeight}]}
          pointerEvents="none"
        /> : null}
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.outer, wrapperStyle]} onPress={onPress} activeOpacity={0.88} testID={testID}>
        {inner}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.outer, wrapperStyle]} testID={testID}>
      {inner}
    </View>
  );
};

export const IconTile: React.FC<{accent: AccentTheme; children: React.ReactNode}> = ({accent, children}) => (
  <View style={[styles.iconTile, {backgroundColor: accent.tint}]}>{children}</View>
);

export const Eyebrow: React.FC<{children: React.ReactNode}> = ({children}) => (
  <Text style={styles.eyebrow}>{children}</Text>
);

export const StatusPill: React.FC<{color: string; tint: string; label: string}> = ({color, tint, label}) => (
  <View style={[styles.pill, {backgroundColor: tint}]}>
    <View style={[styles.pillDot, {backgroundColor: color}]} />
    <Text style={[styles.pillText, {color}]}>{label}</Text>
  </View>
);

export const FooterLink: React.FC<{label: string; color?: string}> = ({label, color = ACCENT.blue.icon}) => (
  <View style={styles.footerRow}>
    <Text style={[styles.footerText, {color}]}>{label} →</Text>
  </View>
);

export const Divider: React.FC<{color?: string}> = ({color = colors.coach.divider}) => (
  <View style={[styles.divider, {backgroundColor: color}]} />
);

const styles = makeStyles(theme => ({
  outer: {
    marginTop: 8,
    marginBottom: 6,
    maxWidth: '92%',
    alignSelf: 'flex-start',
    borderRadius: CARD_RADIUS,
    shadowColor: theme.colors.shadow,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.coach.eyebrowText,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
}));
