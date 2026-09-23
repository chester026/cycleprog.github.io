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
import {useProfile} from '../data/hooks/useProfile';
import {useUpdateProfile} from '../data/hooks/useUpdateProfile';
import type {UserProfile} from '@bikelab/shared/types';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';

export const TrainingSettingsScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // T-5.1/A-17: shared useProfile()/useUpdateProfile() cache entry instead
  // of this screen's own apiFetch('/api/user-profile') GET/PUT pair.
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [profile, setProfile] = useState<UserProfile>({});

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
      await updateProfile.mutateAsync(profile);
      Alert.alert(t('common.success'), t('settings.trainingUpdated'));
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving profile:', error);
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
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
            value={profile.time_available?.toString() || ''}
            onChangeText={(text) =>
              setProfile({...profile, time_available: parseFloat(text) || undefined})
            }
            placeholder="5"
            placeholderTextColor={theme.colors.separator}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.workoutsPerWeek')}</Text>
          <TextInput
            style={styles.input}
            value={profile.workouts_per_week?.toString() || ''}
            onChangeText={(text) =>
              setProfile({...profile, workouts_per_week: parseInt(text, 10) || undefined})
            }
            placeholder="3"
            placeholderTextColor={theme.colors.separator}
            keyboardType="numeric"
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
