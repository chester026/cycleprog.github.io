import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import type {UserProfile} from '@bikelab/shared/types';
import {cooperTestVO2max, vo2maxCategory} from '@bikelab/shared/calc';
import type {Vo2maxCategory} from '@bikelab/shared/calc';
import {makeStyles, useTheme, withOpacity} from '../theme';

interface Props {
  userProfile: UserProfile | null;
}

const CATEGORY_LABEL_KEYS: Record<Vo2maxCategory, string> = {
  beginner: 'vo2max.levelBeginner',
  belowAverage: 'vo2max.levelBelowAvg',
  average: 'vo2max.levelAverage',
  aboveAverage: 'vo2max.levelAboveAvg',
  excellent: 'vo2max.levelExcellent',
  elite: 'vo2max.levelElite',
};

export const VO2maxWidget: React.FC<Props> = ({userProfile}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [testDistance, setTestDistance] = useState('');
  const [age, setAge] = useState(userProfile?.age?.toString() || '');
  const [weight, setWeight] = useState(userProfile?.weight?.toString() || '');
  const [gender, setGender] = useState<'male' | 'female'>(userProfile?.gender === 'female' ? 'female' : 'male');
  const [result, setResult] = useState<number | null>(null);

  const calculate = () => {
    const dist = parseFloat(testDistance);
    const ageVal = parseFloat(age);
    const weightVal = parseFloat(weight);

    if (!dist || !ageVal || !weightVal) return;

    setResult(cooperTestVO2max(dist, {age: ageVal, weight: weightVal, gender}));
  };

  const getLevel = (val: number): string => t(CATEGORY_LABEL_KEYS[vo2maxCategory(val)]);

  const reset = () => {
    setTestDistance('');
    setResult(null);
  };

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{t('vo2max.sectionTitle')}</Text>
      <Text style={s.subtitle}>{t('vo2max.cooperTest')}</Text>

      <View style={s.fields}>
        <View style={s.fieldsRow}>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('vo2max.distance12min')}</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="3000"
              placeholderTextColor={theme.colors.text.placeholder}
              keyboardType="numeric"
              value={testDistance}
              onChangeText={setTestDistance}
            />
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('vo2max.age')}</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="35"
              placeholderTextColor={theme.colors.text.placeholder}
              keyboardType="numeric"
              value={age}
              onChangeText={setAge}
            />
          </View>
        </View>

        <View style={s.fieldsRow}>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('vo2max.weight')}</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="75"
              placeholderTextColor={theme.colors.text.placeholder}
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
            />
          </View>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('vo2max.gender')}</Text>
            <View style={s.genderRow}>
              <TouchableOpacity
                style={[s.genderBtn, gender === 'male' && s.genderBtnActive]}
                onPress={() => setGender('male')}>
                <Text style={[s.genderBtnText, gender === 'male' && s.genderBtnTextActive]}>
                  {t('vo2max.male')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.genderBtn, gender === 'female' && s.genderBtnActive]}
                onPress={() => setGender('female')}>
                <Text style={[s.genderBtnText, gender === 'female' && s.genderBtnTextActive]}>
                  {t('vo2max.female')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={s.calcBtn} onPress={calculate} activeOpacity={0.7}>
          <Text style={s.calcBtnText}>{t('vo2max.calculate')}</Text>
        </TouchableOpacity>
        {result !== null && (
          <TouchableOpacity onPress={reset}>
            <Text style={s.resetText}>{t('vo2max.reset')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {result !== null && (
        <View style={s.resultBlock}>
          <View style={s.resultMain}>
            <Text style={s.resultValue}>{result}</Text>
            <Text style={s.resultUnit}>{t('vo2max.unit')}</Text>
          </View>
          <View style={s.resultMeta}>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>{t('vo2max.fitnessLevel')}</Text>
              <Text style={s.resultLevelValue}>{getLevel(result)}</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>{t('vo2max.testResult')}</Text>
              <Text style={s.resultMetaValue}>{t('vo2max.testResultValue', {distance: testDistance})}</Text>
            </View>
          </View>
          {(weight || age) ? <View style={s.profileBadge}>
              <Text style={s.profileBadgeText}>
                {t('vo2max.profileUsed')} {age ? `${t('vo2max.age')}: ${age}` : null} {weight ? `${t('vo2max.weight')}: ${weight}kg` : null} {gender === 'female' ? t('vo2max.female') : t('vo2max.male')}
              </Text>
            </View> : null}
        </View>
      )}
    </View>
  );
};

const s = makeStyles(theme => ({
  section: {
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: theme.colors.text.primary,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.text.faint,
    marginBottom: 16,
  },
  fields: {
    gap: 16,
    marginBottom: 16,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: 32,
  },
  fieldGroup: {
    flex: 1,
    gap: 0,
  },
  fieldLabel: {
    fontSize: 14,
    color: withOpacity(theme.colors.black, 0.2),
    fontWeight: '500',
  },
  fieldInput: {
    fontSize: 52,
    fontWeight: '900',
    color: theme.colors.surfaceDark,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 0,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
  },
  genderBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.divider,
  },
  genderBtnActive: {
    backgroundColor: theme.colors.accent,
  },
  genderBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.faint,
  },
  genderBtnTextActive: {
    color: theme.colors.text.inverse,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
    width: '65%',
  },
  calcBtn: {
    flex: 1,
    backgroundColor: theme.colors.successAlt,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnText: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: '600',
  },
  resetText: {
    fontSize: 14,
    color: withOpacity(theme.colors.black, 0.5),
    fontWeight: '600',
    padding: 16,
  },
  resultBlock: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    marginTop: 8,
  },
  resultMain: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 16,
  },
  resultValue: {
    fontSize: 48,
    fontWeight: '900',
    color: theme.colors.text.inverse,
  },
  resultUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: withOpacity(theme.colors.text.inverse, 0.5),
  },
  resultMeta: {
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 13,
    color: withOpacity(theme.colors.text.inverse, 0.5),
  },
  resultLevelValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  resultMetaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: withOpacity(theme.colors.text.inverse, 0.8),
  },
  profileBadge: {
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.08),
    padding: 10,
    marginTop: 12,
  },
  profileBadgeText: {
    fontSize: 12,
    color: withOpacity(theme.colors.text.inverse, 0.5),
  },
}));
