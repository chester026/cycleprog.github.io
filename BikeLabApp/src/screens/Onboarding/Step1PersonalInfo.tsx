import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Platform, View, Text, TextInput, TouchableOpacity} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {ageFromBirthDate} from '@bikelab/shared/calc';
import {birthDateToDate, dateToBirthDateString} from '../../utils/birthDate';
import type {OnboardingFormData} from './lib';
import {onboardingStepStyles as styles} from './styles';
import {useTheme} from '../../theme';

interface Props {
  formData: OnboardingFormData;
  updateField: (field: keyof OnboardingFormData, value: string) => void;
}

export const Step1PersonalInfo: React.FC<Props> = ({formData, updateField}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const birthDate = birthDateToDate(formData.birth_date);
  const age = ageFromBirthDate(formData.birth_date);

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
        <View style={[styles.inputGroup, styles.inputGroupHalfLeft]}>
          <Text style={styles.label}>{t('onboarding.height')}</Text>
          <TextInput
            style={styles.input}
            value={formData.height}
            onChangeText={v => updateField('height', v)}
            placeholder="175"
            placeholderTextColor={theme.colors.activityDetails.mutedText}
            keyboardType="numeric"
          />
        </View>
        <View style={[styles.inputGroup, styles.inputGroupHalfRight]}>
          <Text style={styles.label}>{t('onboarding.weight')}</Text>
          <TextInput
            style={styles.input}
            value={formData.weight}
            onChangeText={v => updateField('weight', v)}
            placeholder="70"
            placeholderTextColor={theme.colors.activityDetails.mutedText}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('onboarding.birthDate')}</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateValue}>
            {birthDate ? birthDate.toLocaleDateString() : t('onboarding.birthDatePlaceholder')}
          </Text>
        </TouchableOpacity>
        {age != null ? <Text style={styles.hint}>{t('onboarding.birthDateAge', {age})}</Text> : null}
        {showDatePicker ? (
          <DateTimePicker
            value={birthDate ?? new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={(_e: unknown, date?: Date) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (date) updateField('birth_date', dateToBirthDateString(date));
            }}
            themeVariant="dark"
          />
        ) : null}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('onboarding.bikeWeight')}</Text>
        <TextInput
          style={styles.input}
          value={formData.bike_weight}
          onChangeText={v => updateField('bike_weight', v)}
          placeholder="8.5"
          placeholderTextColor={theme.colors.activityDetails.mutedText}
          keyboardType="decimal-pad"
        />
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
