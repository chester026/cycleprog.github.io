import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity} from 'react-native';
import type {OnboardingFormData} from './lib';
import {EXPERIENCE_LEVEL_KEYS} from './lib';
import {onboardingStepStyles as styles} from './styles';

interface Props {
  formData: OnboardingFormData;
  updateField: (field: keyof OnboardingFormData, value: string) => void;
}

export const Step3Experience: React.FC<Props> = ({formData, updateField}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('onboarding.experienceLevel')}</Text>
      <Text style={styles.stepDescription}>
        {t('onboarding.experienceHint')}
      </Text>

      {EXPERIENCE_LEVEL_KEYS.map(level => (
        <TouchableOpacity
          key={level.value}
          style={[
            styles.experienceCard,
            formData.experience_level === level.value && styles.experienceCardActive,
          ]}
          onPress={() => updateField('experience_level', level.value)}>
          <View style={styles.experienceHeader}>
            <View
              style={[
                styles.radio,
                formData.experience_level === level.value && styles.radioActive,
              ]}>
              {formData.experience_level === level.value && (
                <View style={styles.radioInner} />
              )}
            </View>
            <Text
              style={[
                styles.experienceLabel,
                formData.experience_level === level.value && styles.experienceLabelActive,
              ]}>
              {t(level.labelKey)}
            </Text>
          </View>
          <Text style={styles.experienceDescription}>{t(level.descKey)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
