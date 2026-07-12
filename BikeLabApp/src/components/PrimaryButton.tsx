import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle} from 'react-native';

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
        <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : '#1A1A1A'} />
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

const styles = StyleSheet.create({
  base: {
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#274dd3',
    shadowColor: '#274dd3',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  danger: {
    backgroundColor: '#FDECEC',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryText: {
    color: '#fff',
  },
  secondaryText: {
    color: '#1A1A1A',
  },
  dangerText: {
    color: '#ef4444',
  },
});
