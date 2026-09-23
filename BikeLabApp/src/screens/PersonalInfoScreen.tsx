import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {ageFromBirthDate} from '@bikelab/shared/calc';
import {PrimaryButton} from '../components/PrimaryButton';
import {logger} from '../lib/logger';
import {useProfile} from '../data/hooks/useProfile';
import {useUpdateProfile} from '../data/hooks/useUpdateProfile';
import {birthDateToDate, dateToBirthDateString} from '../utils/birthDate';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';

// This screen keeps `weight` as a string locally (the TextInput's raw text
// value, before it's coerced back to a number on save). Deliberately its
// own small shape rather than `Omit<UserProfile, 'weight'>` — `UserProfile`
// is a `.passthrough()` zod schema, and `Omit` over a type with a string
// index signature collapses every remaining field's type to `unknown`
// (a well-known TS/zod-passthrough footgun), which defeated the
// UserProfileUpdate typing on save below.
//
// `age` was replaced by `birth_date` (ISO YYYY-MM-DD, nullable) — the server
// derives and still returns `age` from it, but this screen no longer collects
// a raw age that would silently go stale every birthday.
interface LocalProfile {
  height?: number;
  weight?: string;
  birth_date?: string | null;
  gender?: string;
  bike_weight?: number;
}

export const PersonalInfoScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // T-5.1/A-17 (docs/audit/layers/02-bikelabapp.md): loads/saves through the
  // shared useProfile()/useUpdateProfile() cache entry instead of this
  // screen's own apiFetch('/api/user-profile') GET/PUT pair.
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [profile, setProfile] = useState<LocalProfile>({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (profileQuery.data) {
      const data = profileQuery.data;
      setProfile({
        height: data.height ?? undefined,
        weight: data.weight != null ? String(data.weight) : undefined,
        birth_date: data.birth_date ?? null,
        gender: data.gender ?? undefined,
        bike_weight: data.bike_weight ?? undefined,
      });
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (profileQuery.isError) {
      logger.error('Error loading profile:', profileQuery.error);
      Alert.alert(t('common.error'), t('settings.failedLoad'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.isError]);

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        height: profile.height,
        weight: profile.weight != null ? parseFloat(profile.weight) : undefined,
        birth_date: profile.birth_date,
        gender: profile.gender,
        bike_weight: profile.bike_weight,
      });
      Alert.alert(t('common.success'), t('settings.personalUpdated'));
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.personalFailed'));
    }
  };

  if (profileQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.text.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.personalTitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.height')}</Text>
          <TextInput
            style={styles.input}
            value={profile.height?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, height: parseInt(text, 10) || undefined})}
            placeholder="175"
            placeholderTextColor={theme.colors.separator}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.weight')}</Text>
          <TextInput
            style={styles.input}
            value={profile.weight?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, weight: text})}
            placeholder="70"
            placeholderTextColor={theme.colors.separator}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.birthDate')}</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.dateValue}>
              {profile.birth_date
                ? birthDateToDate(profile.birth_date)?.toLocaleDateString() ?? t('settings.birthDatePlaceholder')
                : t('settings.birthDatePlaceholder')}
            </Text>
            {profile.birth_date && ageFromBirthDate(profile.birth_date) != null ? (
              <Text style={styles.ageHint}>{t('settings.birthDateAge', {age: ageFromBirthDate(profile.birth_date)})}</Text>
            ) : null}
          </TouchableOpacity>
          {showDatePicker ? (
            <DateTimePicker
              value={birthDateToDate(profile.birth_date) ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={(_e: unknown, date?: Date) => {
                if (Platform.OS === 'android') setShowDatePicker(false);
                if (date) setProfile({...profile, birth_date: dateToBirthDateString(date)});
              }}
              themeVariant="light"
            />
          ) : null}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.gender')}</Text>
          <View style={styles.segmentedControl}>
            {['male', 'female', 'other'].map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.segment,
                  profile.gender === g && styles.segmentActive,
                ]}
                onPress={() => setProfile({...profile, gender: g})}>
                <Text
                  style={[
                    styles.segmentText,
                    profile.gender === g && styles.segmentTextActive,
                  ]}>
                  {g === 'male' ? t('settings.male') : g === 'female' ? t('settings.female') : t('settings.other')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.bikeWeight')}</Text>
          <TextInput
            style={styles.input}
            value={profile.bike_weight?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, bike_weight: parseFloat(text) || undefined})}
            placeholder="8.5"
            placeholderTextColor={theme.colors.separator}
            keyboardType="decimal-pad"
          />
        </View>

        <PrimaryButton
          title={updateProfile.isPending ? t('common.saving') : t('common.save')}
          onPress={handleSave}
          loading={updateProfile.isPending}
          style={styles.saveButton}
        />
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  root: {flex: 1, backgroundColor: theme.colors.backgroundLight},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundLight},

  header: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  backArrow: {fontSize: 32, color: theme.colors.text.primary, lineHeight: 34, fontWeight: '300', marginBottom: 4},
  // Single solid color, no highlighted word — per explicit design direction.
  title: {fontSize: 32, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.8},

  scroll: {flex: 1},
  form: {padding: 20, paddingBottom: 48},

  inputGroup: {marginBottom: 20},
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.iosMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text.primary,
    ...theme.shadows.card,
  },
  dateValue: {fontSize: 20, fontWeight: '800', color: theme.colors.text.primary},
  ageHint: {fontSize: 13, fontWeight: '600', color: theme.colors.text.iosMuted, marginTop: 4},

  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: theme.colors.segmentTrackBg,
    borderRadius: theme.radii.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: theme.colors.accent,
  },
  segmentText: {fontSize: 15, fontWeight: '600', color: theme.colors.text.iosMuted},
  segmentTextActive: {color: theme.colors.text.inverse, fontWeight: '700'},

  saveButton: {marginTop: 16},
}));
