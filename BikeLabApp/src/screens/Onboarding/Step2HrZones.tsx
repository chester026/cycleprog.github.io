import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput} from 'react-native';
import {computeHrZones, type HrZones} from '@bikelab/shared/calc';
import type {OnboardingFormData} from './lib';
import {estimateRestingHrFromExperience} from './lib';
import {onboardingStepStyles as styles} from './styles';

interface Props {
  formData: OnboardingFormData;
  updateField: (field: keyof OnboardingFormData, value: string) => void;
}

const ZONE_NAME_KEYS = [
  'onboarding.z1Recovery',
  'onboarding.z2Endurance',
  'onboarding.z3Tempo',
  'onboarding.z4Threshold',
  'onboarding.z5Vo2Max',
];

export const Step2HrZones: React.FC<Props> = ({formData, updateField}) => {
  const {t} = useTranslation();

  // Live preview of HR zones for the values currently in the form (T-3.1):
  // the saved value is server-derived; this is just the wizard's preview.
  const hrZones = useMemo((): HrZones | null => {
    const age = parseInt(formData.age, 10) || 0;
    const maxHR = parseInt(formData.max_hr, 10) || 0;

    if (!maxHR && !age) return null;

    const restingHR =
      parseInt(formData.resting_hr, 10) || estimateRestingHrFromExperience(formData.experience_level);
    const lt = parseInt(formData.lactate_threshold, 10) || 0;

    return computeHrZones({
      max_hr: maxHR || null,
      resting_hr: restingHR,
      lactate_threshold: lt || null,
      age: age || null,
    });
  }, [formData.age, formData.max_hr, formData.resting_hr, formData.lactate_threshold, formData.experience_level]);

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('onboarding.hrZones')}</Text>
      <Text style={styles.stepDescription}>
        {t('onboarding.hrZonesHint')}
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('onboarding.maxHR')}</Text>
        <TextInput
          style={styles.input}
          value={formData.max_hr}
          onChangeText={v => updateField('max_hr', v)}
          placeholder="190"
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('onboarding.restingHR')}</Text>
        <TextInput
          style={styles.input}
          value={formData.resting_hr}
          onChangeText={v => updateField('resting_hr', v)}
          placeholder="60"
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('onboarding.lactateHR')}</Text>
        <TextInput
          style={styles.input}
          value={formData.lactate_threshold}
          onChangeText={v => updateField('lactate_threshold', v)}
          placeholder="165"
          placeholderTextColor="#555"
          keyboardType="numeric"
        />
        <Text style={styles.hint}>{t('onboarding.lactateHint')}</Text>
      </View>

      {hrZones && (
        <View style={styles.zonesPreview}>
          <Text style={styles.zonesTitle}>{t('onboarding.calculatedZones')}</Text>
          {ZONE_NAME_KEYS.map((nameKey, i) => {
            const zone = hrZones.zones[i];
            return (
              <View key={nameKey} style={styles.zoneRow}>
                <View style={[styles.zoneDot, {backgroundColor: zone.color}]} />
                <Text style={styles.zoneName}>{t(nameKey)}</Text>
                <Text style={styles.zoneRange}>
                  {zone.min}-{zone.max ?? hrZones.basis.max_hr}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};
