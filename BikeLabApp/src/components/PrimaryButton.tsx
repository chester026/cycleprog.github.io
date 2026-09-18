import React from 'react';
import {ActivityIndicator, Text, TouchableOpacity, ViewStyle} from 'react-native';
import {makeStyles, useTheme} from '../theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /**
   * primary — solid brand-blue pill with shadow (Save changes, Connect...).
   * secondary — white/bordered pill, black text (Refresh, neutral actions).
   * danger — light pink pill, red text (Unlink account, destructive actions
   * that aren't scary enough to need a solid red fill).
   */
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

// Single reusable blue-pill CTA — was previously redefined (with slightly
// different colors/radii) in PersonalInfoScreen, HRZonesScreen,
// AppleHealthScreen and StravaIntegrationScreen. Now those all import this
// instead of rolling their own button styles.
export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}) => {
  const isDisabled = disabled || loading;
  const theme = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.colors.text.inverse : theme.colors.text.primary}
        />
      ) : (
        <Text
          style={[
            styles.text,
            variant === 'primary' && styles.primaryText,
            variant === 'secondary' && styles.secondaryText,
            variant === 'danger' && styles.dangerText,
          ]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  base: {
    borderRadius: theme.radii.pill,
    paddingVertical: theme.spacing[18],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: theme.colors.accent,
    ...theme.shadows.buttonPrimary,
  },
  secondary: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  danger: {
    backgroundColor: theme.colors.dangerSurface,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
  },
  primaryText: {
    color: theme.colors.text.inverse,
  },
  secondaryText: {
    color: theme.colors.text.primary,
  },
  dangerText: {
    color: theme.colors.danger,
  },
}));
