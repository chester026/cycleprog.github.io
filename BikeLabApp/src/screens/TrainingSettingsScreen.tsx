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
} from 'react-native';
import {PrimaryButton} from '../components/PrimaryButton';
import {logger} from '../lib/logger';
import {ApiError} from '../utils/api';
import {
  MAX_WEEKLY_HOURS,
  MAX_WORKOUTS_PER_WEEK,
  MIN_WEEKLY_HOURS,
  MIN_WORKOUTS_PER_WEEK,
  isWithinRange,
  parseNumberInput,
} from './TrainingSettings/lib';
import {useProfile} from '../data/hooks/useProfile';
import {useUpdateProfile} from '../data/hooks/useUpdateProfile';
import type {UserProfile} from '@bikelab/shared/types';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';
import {KEYBOARD_DISMISS_PROPS} from '../constants/keyboard';
import {useTabBarBottomPadding} from '../hooks/useTabBarBottomPadding';

export const TrainingSettingsScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const bottomPadding = useTabBarBottomPadding();
  // T-5.1/A-17: shared useProfile()/useUpdateProfile() cache entry instead
  // of this screen's own apiFetch('/api/user-profile') GET/PUT pair.
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [profile, setProfile] = useState<UserProfile>({});
  // Raw text, not parsed numbers: "0" or "41" must stay visible (and flagged)
  // instead of being coerced away while typing.
  const [hoursText, setHoursText] = useState('');
  const [workoutsText, setWorkoutsText] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const hoursInvalid = !isWithinRange(hoursText, MIN_WEEKLY_HOURS, MAX_WEEKLY_HOURS);
  const workoutsInvalid = !isWithinRange(workoutsText, MIN_WORKOUTS_PER_WEEK, MAX_WORKOUTS_PER_WEEK, true);

  const experienceLevels = [
    {value: 'beginner', label: t('settings.beginner')},
    {value: 'intermediate', label: t('settings.intermediate')},
    {value: 'advanced', label: t('settings.advanced')},
  ];

  useEffect(() => {
    if (profileQuery.data) {
      const data = profileQuery.data;
      setProfile({
        experience_level: data.experience_level || 'intermediate',
        time_available: data.time_available,
        workouts_per_week: data.workouts_per_week,
      });
      setHoursText(data.time_available?.toString() ?? '');
      setWorkoutsText(data.workouts_per_week?.toString() ?? '');
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
      setServerError(null);
      await updateProfile.mutateAsync({
        ...profile,
        time_available: parseNumberInput(hoursText) ?? undefined,
        workouts_per_week: parseNumberInput(workoutsText) ?? undefined,
      });
      Alert.alert(t('common.success'), t('settings.trainingUpdated'));
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving profile:', error);
      if (error instanceof ApiError && error.status === 400) {
        setServerError(error.message);
        return;
      }
      Alert.alert(t('common.error'), t('settings.trainingFailed'));
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
        <Text style={styles.title}>{t('settings.trainingTitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} {...KEYBOARD_DISMISS_PROPS} contentContainerStyle={[styles.form, {paddingBottom: bottomPadding}]} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.experienceLevel')}</Text>
          <View style={styles.levelStack}>
            {experienceLevels.map((level) => (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.levelRow,
                  profile.experience_level === level.value && styles.levelRowActive,
                ]}
                onPress={() => setProfile({...profile, experience_level: level.value})}>
                <Text
                  style={[
                    styles.levelText,
                    profile.experience_level === level.value && styles.levelTextActive,
                  ]}>
                  {level.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.trainingTime')}</Text>
          <TextInput
            style={styles.input}
            value={hoursText}
            onChangeText={setHoursText}
            placeholder="5"
            placeholderTextColor={theme.colors.separator}
            keyboardType="decimal-pad"
            testID="training-hours-input"
          />
          {hoursInvalid ? (
            <Text style={styles.errorText} testID="training-hours-error">
              {t('settings.hoursRangeError', {min: MIN_WEEKLY_HOURS, max: MAX_WEEKLY_HOURS})}
            </Text>
          ) : (
            <Text style={styles.helperText}>{t('settings.hoursHint')}</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.workoutsPerWeek')}</Text>
          <TextInput
            style={styles.input}
            value={workoutsText}
            onChangeText={setWorkoutsText}
            placeholder="3"
            placeholderTextColor={theme.colors.separator}
            keyboardType="numeric"
            testID="training-workouts-input"
          />
          {workoutsInvalid ? (
            <Text style={styles.errorText} testID="training-workouts-error">
              {t('settings.workoutsRangeError', {min: MIN_WORKOUTS_PER_WEEK, max: MAX_WORKOUTS_PER_WEEK})}
            </Text>
          ) : null}
        </View>

        {serverError ? (
          <Text style={styles.errorText} testID="training-server-error">
            {serverError}
          </Text>
        ) : null}

        <PrimaryButton
          disabled={hoursInvalid || workoutsInvalid}
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
  title: {fontSize: 32, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.8},

  scroll: {flex: 1},
  form: {padding: 20},

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

  helperText: {fontSize: theme.typography.fontSize.sm, color: theme.colors.text.iosMuted, marginTop: 8, lineHeight: 16},
  errorText: {fontSize: theme.typography.fontSize.sm, color: theme.colors.dangerStrong, marginTop: 8, lineHeight: 16},

  levelStack: {gap: 10},
  levelRow: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  levelRowActive: {
    backgroundColor: theme.colors.accent,
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.3,
  },
  levelText: {fontSize: 16, fontWeight: '700', color: theme.colors.text.primary},
  levelTextActive: {color: theme.colors.text.inverse},

  saveButton: {marginTop: 16},
}));
