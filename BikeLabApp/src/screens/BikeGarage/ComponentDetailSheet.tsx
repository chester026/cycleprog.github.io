// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b): the bottom-sheet modal shown when a component card is
// tapped. `slideAnim` stays owned by the screen (it's driven from
// open/close handlers there) and is passed in as a prop.
import React, {useEffect, useState} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme, withOpacity} from '../../theme';
import {KEYBOARD_DISMISS_PROPS} from '../../constants/keyboard';
import {STATUS_TINT, parseInitialKm} from './lib';
import type {ComponentHealth, BikeHealth} from './types';

interface SheetRowProps {
  label: string;
  value: string;
}

const SheetRow: React.FC<SheetRowProps> = ({label, value}) => (
  <View style={styles.sheetRow}>
    <Text style={styles.sheetRowLabel}>{label}</Text>
    <Text style={styles.sheetRowVal}>{value}</Text>
  </View>
);

interface ComponentDetailSheetProps {
  visible: boolean;
  component: ComponentHealth | null;
  componentLabels: BikeHealth['componentLabels'];
  slideAnim: Animated.Value;
  onClose: () => void;
  /** `initialKm` > 0 = the replaced part is used and already has that many km. */
  onReset: (componentId: string, initialKm: number) => void;
}

const SHEET_MAX_HEIGHT_RATIO = 0.9;

export const ComponentDetailSheet: React.FC<ComponentDetailSheetProps> = ({
  visible,
  component,
  componentLabels,
  slideAnim,
  onClose,
  onReset,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const {height: windowHeight} = useWindowDimensions();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [initialKmText, setInitialKmText] = useState('');

  useEffect(() => {
    if (!visible) {
      setAdvancedOpen(false);
      setInitialKmText('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            {transform: [{translateY: slideAnim.interpolate({inputRange: [0, 1], outputRange: [400, 0]})}]},
          ]}>
          <TouchableOpacity activeOpacity={1}>
            <ScrollView
              {...KEYBOARD_DISMISS_PROPS}
              bounces={false}
              showsVerticalScrollIndicator={false}
              style={{maxHeight: windowHeight * SHEET_MAX_HEIGHT_RATIO}}>
            {component ? <>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>
                    {componentLabels?.[component.id] || t(`bikeGarage.comp_${component.id}`)}
                  </Text>
                  <TouchableOpacity onPress={onClose} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
                    <Text style={styles.sheetClose}>{'×'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.sheetHero}>
                  <Text style={[styles.sheetPercent, {color: STATUS_TINT[component.status]}]}>
                    {component.healthPercent}
                  </Text>
                  <Text style={[styles.sheetPercentSign, {color: STATUS_TINT[component.status]}]}>%</Text>
                  <Text style={styles.sheetPercentLabel}>{t('bikeGarage.health')}</Text>
                </View>

                <View style={styles.sheetBarTrack}>
                  <View
                    style={[
                      styles.sheetBarFill,
                      {width: `${component.healthPercent}%`, backgroundColor: STATUS_TINT[component.status]},
                    ]}
                  />
                </View>

                <View style={styles.sheetRows}>
                  <SheetRow label={t('bikeGarage.kmSinceReset')} value={`${component.kmSinceReset.toLocaleString()} ${t('common.km')}`} />
                  {component.initialKm > 0 ? (
                    <Text style={styles.initialKmNote} testID="component-initial-km-note">
                      {t('bikeGarage.initialKmIncluded', {km: component.initialKm.toLocaleString()})}
                    </Text>
                  ) : null}
                  <SheetRow label={t('bikeGarage.effectiveKm')} value={`${component.effectiveKm.toLocaleString()} ${t('common.km')}`} />
                  <SheetRow label={t('bikeGarage.lifecycle')} value={`${component.baseLifecycle.toLocaleString()} ${t('common.km')}`} />
                  <SheetRow label={t('bikeGarage.remainingKm')} value={`~${component.remainingKm.toLocaleString()} ${t('common.km')}`} />
                  <View style={styles.sheetDivider} />
                  <SheetRow label={t('bikeGarage.weightFactor')} value={`${component.weightFactor}`} />
                  <SheetRow label={t('bikeGarage.styleFactor')} value={`${component.styleFactor}`} />
                </View>

                <TouchableOpacity
                  style={styles.advancedToggle}
                  onPress={() => setAdvancedOpen(open => !open)}
                  accessibilityRole="button"
                  accessibilityState={{expanded: advancedOpen}}
                  testID="advanced-toggle">
                  <Text style={styles.advancedToggleText}>
                    {t('bikeGarage.advanced')} {advancedOpen ? '▴' : '▾'}
                  </Text>
                </TouchableOpacity>

                {advancedOpen ? (
                  <View style={styles.initialKmRow}>
                    <Text style={styles.initialKmLabel}>{t('bikeGarage.initialKmPrefix')}</Text>
                    <TextInput
                      style={styles.initialKmInput}
                      value={initialKmText}
                      onChangeText={setInitialKmText}
                      placeholder="0"
                      placeholderTextColor={theme.colors.separator}
                      keyboardType="numeric"
                      maxLength={6}
                      testID="reset-initial-km-input"
                    />
                    <Text style={styles.initialKmLabel}>{t('bikeGarage.initialKmSuffix')}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={() => onReset(component.id, advancedOpen ? parseInitialKm(initialKmText) : 0)}>
                  <Text style={styles.resetBtnText}>{t('bikeGarage.markReplaced')}</Text>
                </TouchableOpacity>
              </> : null}
            </ScrollView>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  flex: {flex: 1},
  overlay: {flex: 1, backgroundColor: withOpacity(theme.colors.black, 0.35), justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: theme.spacing[24],
    paddingBottom: 44,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.garage.pillBorder,
    alignSelf: 'center',
    marginTop: theme.spacing[10],
    marginBottom: theme.spacing[16],
  },
  sheetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing[20]},
  sheetTitle: {fontSize: theme.typography.fontSize.xxl, fontWeight: '700', color: theme.colors.text.primary, letterSpacing: -0.3},
  sheetClose: {fontSize: theme.typography.fontSize.xxxl, color: theme.colors.text.iosMuted, fontWeight: '300', lineHeight: 26},
  sheetHero: {flexDirection: 'row', alignItems: 'baseline', marginBottom: theme.spacing[12]},
  sheetPercent: {fontSize: 56, fontWeight: '800', letterSpacing: -3},
  sheetPercentSign: {fontSize: theme.typography.fontSize.xxl, fontWeight: '600', marginLeft: 2},
  sheetPercentLabel: {fontSize: 15, color: theme.colors.text.iosMuted, fontWeight: '500', marginLeft: theme.spacing[8]},
  sheetBarTrack: {height: 6, backgroundColor: theme.colors.garage.barTrack, borderRadius: 3, overflow: 'hidden', marginBottom: theme.spacing[24]},
  sheetBarFill: {height: '100%', borderRadius: 3},
  sheetRows: {gap: theme.spacing[14], marginBottom: 28},
  sheetRow: {flexDirection: 'row', justifyContent: 'space-between'},
  sheetRowLabel: {fontSize: theme.typography.fontSize.lg, color: theme.colors.text.iosMuted, fontWeight: '500'},
  sheetRowVal: {fontSize: theme.typography.fontSize.lg, fontWeight: '600', color: theme.colors.text.primary},
  initialKmNote: {fontSize: theme.typography.fontSize.sm, color: theme.colors.text.iosMuted, marginTop: -theme.spacing[8], textAlign: 'right'},
  advancedToggle: {alignSelf: 'flex-start', paddingVertical: theme.spacing[8], marginBottom: theme.spacing[8]},
  advancedToggleText: {fontSize: theme.typography.fontSize.base, fontWeight: '600', color: theme.colors.text.iosMuted},
  initialKmRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing[8], marginBottom: theme.spacing[16]},
  initialKmLabel: {fontSize: theme.typography.fontSize.base, color: theme.colors.text.iosMuted, fontWeight: '500'},
  initialKmInput: {
    minWidth: 84,
    textAlign: 'right',
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[8],
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  sheetDivider: {height: 1, backgroundColor: theme.colors.garage.divider},
  resetBtn: {
    backgroundColor: theme.colors.text.primary,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing[16],
    alignItems: 'center',
  },
  resetBtnText: {fontSize: 15, fontWeight: '600', color: theme.colors.text.inverse},
}));
