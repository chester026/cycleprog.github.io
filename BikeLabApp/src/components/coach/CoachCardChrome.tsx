import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View, ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

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

export const ACCENT: Record<'blue' | 'green' | 'amber' | 'orange' | 'red' | 'purple' | 'gray', AccentTheme> = {
  blue: {icon: '#2F6BFF', tint: 'rgba(47,107,255,0.12)', glow: 'rgba(47,107,255,0.09)', border: '#E9EAF0', gradTop: '#FBFCFF'},
  green: {icon: '#1FB16B', tint: 'rgba(31,177,107,0.10)', glow: 'rgba(20,168,99,0.09)', border: '#E4EFE9', gradTop: '#F6FCF9'},
  amber: {icon: '#F5A11E', tint: 'rgba(245,161,30,0.12)', glow: 'rgba(245,161,30,0.08)', border: '#F0E7D8', gradTop: '#FFFAF2'},
  orange: {icon: '#FC5200', tint: 'rgba(252,82,0,0.10)', glow: 'rgba(252,82,0,0.08)', border: '#F6E2D8', gradTop: '#FFF8F4'},
  red: {icon: '#E5484D', tint: 'rgba(229,72,77,0.10)', glow: 'rgba(229,72,77,0.08)', border: '#F5DEDF', gradTop: '#FFF8F8'},
  purple: {icon: '#8B5CF6', tint: 'rgba(139,92,246,0.12)', glow: 'rgba(139,92,246,0.08)', border: '#ECE7FB', gradTop: '#FAF8FF'},
  gray: {icon: '#6B7280', tint: 'rgba(107,114,128,0.10)', glow: 'rgba(107,114,128,0.06)', border: '#ECECEF', gradTop: '#FAFAFC'},
};

export const CoachCard: React.FC<{
  accent?: AccentTheme;
  glow?: boolean;
  glowHeight?: number;
  onPress?: () => void;
  style?: ViewStyle;
  wrapperStyle?: ViewStyle;
  children: React.ReactNode;
}> = ({accent = ACCENT.gray, glow = true, glowHeight = 64, onPress, style, wrapperStyle, children}) => {
  const inner = (
    <LinearGradient
      colors={[accent.gradTop, '#FFFFFF']}
      style={[styles.card, {borderColor: accent.border}, style]}>
      {glow && (
        <LinearGradient
          colors={[accent.glow, 'rgba(255,255,255,0)']}
          style={[styles.glow, {height: glowHeight}]}
          pointerEvents="none"
        />
      )}
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.outer, wrapperStyle]} onPress={onPress} activeOpacity={0.88}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.outer, wrapperStyle]}>{inner}</View>;
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

export const Divider: React.FC<{color?: string}> = ({color = '#F1F1F4'}) => (
  <View style={[styles.divider, {backgroundColor: color}]} />
);

const styles = StyleSheet.create({
  outer: {
    marginTop: 8,
    marginBottom: 6,
    maxWidth: '92%',
    alignSelf: 'flex-start',
    borderRadius: CARD_RADIUS,
    shadowColor: '#10101E',
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
    color: '#8A8A93',
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
});
