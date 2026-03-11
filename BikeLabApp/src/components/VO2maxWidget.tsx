import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';

interface UserProfile {
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
}

interface Props {
  userProfile: UserProfile | null;
}

export const VO2maxWidget: React.FC<Props> = ({userProfile}) => {
  const {t} = useTranslation();
  const [testDistance, setTestDistance] = useState('');
  const [age, setAge] = useState(userProfile?.age?.toString() || '');
  const [weight, setWeight] = useState(userProfile?.weight?.toString() || '');
  const [gender, setGender] = useState<'male' | 'female'>(userProfile?.gender || 'male');
  const [result, setResult] = useState<number | null>(null);

  const calculate = () => {
    const dist = parseFloat(testDistance);
    const ageVal = parseFloat(age);
    const weightVal = parseFloat(weight);

    if (!dist || !ageVal || !weightVal) return;

    let vo2max = dist * 0.02241 - 11.288;

    if (ageVal > 40) vo2max *= 1 - (ageVal - 40) * 0.005;
    else if (ageVal < 25) vo2max *= 1 + (25 - ageVal) * 0.003;

    if (gender === 'female') vo2max *= 0.9;

    if (weightVal > 80) vo2max *= 0.98;
    else if (weightVal < 60) vo2max *= 1.02;

    setResult(Math.round(vo2max));
  };

  const getLevel = (val: number): string => {
    if (val < 30) return t('vo2max.levelBeginner');
    if (val < 40) return t('vo2max.levelBelowAvg');
    if (val < 50) return t('vo2max.levelAverage');
    if (val < 60) return t('vo2max.levelAboveAvg');
    if (val < 70) return t('vo2max.levelExcellent');
    return t('vo2max.levelElite');
  };

  const reset = () => {
    setTestDistance('');
    setResult(null);
  };

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>VO2max</Text>
      <Text style={s.subtitle}>{t('vo2max.cooperTest')}</Text>

      <View style={s.fields}>
        <View style={s.fieldsRow}>
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{t('vo2max.distance12min')}</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="3000"
              placeholderTextColor="#aaa"
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
              placeholderTextColor="#aaa"
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
              placeholderTextColor="#aaa"
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
                  M
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.genderBtn, gender === 'female' && s.genderBtnActive]}
                onPress={() => setGender('female')}>
                <Text style={[s.genderBtnText, gender === 'female' && s.genderBtnTextActive]}>
                  F
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
              <Text style={s.resultMetaValue}>{testDistance}m / 12 min</Text>
            </View>
          </View>
          {(weight || age) && (
            <View style={s.profileBadge}>
              <Text style={s.profileBadgeText}>
                {t('vo2max.profileUsed')} {age && `${t('vo2max.age')}: ${age}`} {weight && `${t('vo2max.weight')}: ${weight}kg`} {gender === 'female' ? 'F' : 'M'}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
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
    color: '#1a1a1a',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 13,
    color: '#999',
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
    color: 'rgba(0, 0, 0, 0.2)',
    fontWeight: '500',
  },
  fieldInput: {
    fontSize: 52,
    fontWeight: '900',
    color: '#222',
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
    backgroundColor: '#f0f0f0',
  },
  genderBtnActive: {
    backgroundColor: '#274dd3',
  },
  genderBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#999',
  },
  genderBtnTextActive: {
    color: '#fff',
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
    backgroundColor: '#4CAF50',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resetText: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.5)',
    fontWeight: '600',
    padding: 16,
  },
  resultBlock: {
    backgroundColor: '#1a1a1a',
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
    color: '#fff',
  },
  resultUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
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
    color: 'rgba(255,255,255,0.5)',
  },
  resultLevelValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#274dd3',
  },
  resultMetaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  profileBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 10,
    marginTop: 12,
  },
  profileBadgeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
});
