import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, TouchableOpacity} from 'react-native';
import type {OnboardingFormData} from './lib';
import {onboardingStepStyles as styles} from './styles';

interface Props {
  formData: OnboardingFormData;
  updateField: (field: keyof OnboardingFormData, value: string) => void;
}

export const Step1PersonalInfo: React.FC<Props> = ({formData, updateField}) => {
  const {t} = useTranslation();

  const genderLabels: Record<string, string> = {
    male: t('onboarding.male'),
    female: t('onboarding.female'),
    other: t('onboarding.other'),
  };

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t('onboarding.personalInfo')}</Text>
      <Text style={styles.stepDescription}>
        {t('onboarding.personalInfoHint')}
      </Text>

      <View style={styles.row}>
        <View style={[styles.inputGroup, {flex: 1, marginRight: 8}]}>
          <Text style={styles.label}>{t('onboarding.height')}</Text>
          <TextInput
            style={styles.input}
            value={formData.height}
            onChangeText={v => updateField('height', v)}
            placeholder="175"
            placeholderTextColor="#555"
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.inputGroup, {flex: 1, marginLeft: 8}]}>
          <Text style={styles.label}>{t('onboarding.weight')}</Text>
          <TextInput
            style={styles.input}
            value={formData.weight}
            onChangeText={v => updateField('weight', v)}
            placeholder="70"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, {flex: 1, marginRight: 8}]}>
          <Text style={styles.label}>{t('onboarding.age')}</Text>
          <TextInput
            style={styles.input}
            value={formData.age}
            onChangeText={v => updateField('age', v)}
            placeholder="30"
            placeholderTextColor="#555"
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.inputGroup, {flex: 1, marginLeft: 8}]}>
          <Text style={styles.label}>{t('onboarding.bikeWeight')}</Text>
          <TextInput
            style={styles.input}
            value={formData.bike_weight}
            onChangeText={v => updateField('bike_weight', v)}
            placeholder="8.5"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('onboarding.gender')}</Text>
        <View style={styles.segmentedControl}>
          {['male', 'female', 'other'].map(g => (
            <TouchableOpacity
              key={g}
              style={[
                styles.segment,
                formData.gender === g && styles.segmentActive,
              ]}
              onPress={() => updateField('gender', g)}>
              <Text
                style={[
                  styles.segmentText,
                  formData.gender === g && styles.segmentTextActive,
                ]}>
                {genderLabels[g]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
};
