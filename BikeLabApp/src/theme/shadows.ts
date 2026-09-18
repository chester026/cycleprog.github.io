// Shadow presets — T-5.4 (audit A-27). Mirrors the exact shadow values
// already hand-written on ActivityCard (bright-card elevation) and
// PrimaryButton's primary variant (accent-tinted CTA glow).
import type {ViewStyle} from 'react-native';
import {colors} from './colors';

export const shadows: Record<string, ViewStyle> = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  buttonPrimary: {
    shadowColor: colors.accent,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
};

export type Shadows = typeof shadows;
