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
import {computeHrZones, type HrZones} from '@bikelab/shared/calc';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';

export const HRZonesScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // T-5.1/A-17: shared useProfile()/useUpdateProfile() cache entry instead
  // of this screen's own apiFetch('/api/user-profile') GET/PUT pair.
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [profile, setProfile] = useState<UserProfile>({});

  useEffect(() => {
    if (profileQuery.data) {
      const data = profileQuery.data;
      setProfile({
        max_hr: data.max_hr,
        resting_hr: data.resting_hr,
        lactate_threshold: data.lactate_threshold,
        age: data.age,
        experience_level: data.experience_level,
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

  const estimateRestingHrFromExperience = (experienceLevel?: string | null): number => {
    switch (experienceLevel) {
      case 'beginner':
        return 75;
      case 'intermediate':
        return 65;
      case 'advanced':
        return 55;
      default:
        return 70;
    }
  };

  // Live preview of HR zones for the values currently in the form (T-3.1,
  // docs/audit/00-AUDIT-AND-PLAN.md T-3.1): the saved value is server-derived
  // (`profile.hr_zones` from GET /api/user-profile), this is just for the
  // "here's what your zones will look like" preview while editing.
  const calculateHeartRateZones = (): HrZones | null => {
    if (!profile.max_hr && !profile.age) return null;
    return computeHrZones({
      max_hr: profile.max_hr ?? null,
      resting_hr: profile.resting_hr ?? estimateRestingHrFromExperience(profile.experience_level),
      lactate_threshold: profile.lactate_threshold ?? null,
      age: profile.age ?? null,
    });
  };

  const handleSave = async () => {
    try {
      await updateProfile.mutateAsync({
        max_hr: profile.max_hr,
        resting_hr: profile.resting_hr,
        lactate_threshold: profile.lactate_threshold,
      });
      Alert.alert(t('common.success'), t('settings.hrUpdated'));
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.hrFailed'));
    }
  };

  const zones = calculateHeartRateZones();
  const zoneLabels = [
    t('settings.zone1'),
    t('settings.zone2'),
    t('settings.zone3'),
    t('settings.zone4'),
    t('settings.zone5'),
  ];
  const zoneRows = zones
    ? zones.zones.map((zone, i) => ({
        key: zone.key,
        label: zoneLabels[i],
        range: {min: zone.min, max: zone.max ?? zones.basis.max_hr},
        color: zone.color,
      }))
    : [];

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
        <Text style={styles.title}>{t('settings.hrTitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.maxHR')}</Text>
          <TextInput
            style={styles.input}
            value={profile.max_hr?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, max_hr: parseInt(text, 10) || undefined})}
            placeholder="190"
            placeholderTextColor={theme.colors.separator}
            keyboardType="numeric"
          />
          <Text style={styles.hint}>{t('settings.maxHRHint')}</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.restingHR')}</Text>
          <TextInput
            style={styles.input}
            value={profile.resting_hr?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, resting_hr: parseInt(text, 10) || undefined})}
            placeholder="60"
            placeholderTextColor={theme.colors.separator}
            keyboardType="numeric"
          />
          <Text style={styles.hint}>{t('settings.restingHRHint')}</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.lactateHR')}</Text>
          <TextInput
            style={styles.input}
            value={profile.lactate_threshold?.toString() || ''}
            onChangeText={(text) =>
              setProfile({...profile, lactate_threshold: parseInt(text, 10) || undefined})
            }
            placeholder="165"
            placeholderTextColor={theme.colors.separator}
            keyboardType="numeric"
          />
          <Text style={styles.hint}>{t('settings.lactateHRHint')}</Text>
        </View>

        {zones ? <View style={styles.inputGroup}>
            <Text style={styles.sectionTitle}>{t('settings.currentZones')}</Text>
            <View style={styles.zonesCard}>
              {zoneRows.map((z, i) => (
                <View key={z.key} style={[styles.zoneRow, i > 0 && styles.zoneRowDivider]}>
                  <View style={[styles.zoneDot, {backgroundColor: z.color}]} />
                  <Text style={styles.zoneName} numberOfLines={1}>{z.label}</Text>
                  <Text style={styles.zoneRange}>
                    {z.range.min}–{z.range.max}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>
                {t('settings.maxHR')}: {zones.basis.max_hr} {t('common.bpm')} {!profile.max_hr && t('settings.estimated')}
              </Text>
              {zones.basis.resting_hr != null && (
                <Text style={styles.summaryText}>
                  {t('settings.restingHR')}: {zones.basis.resting_hr} {t('common.bpm')} {!profile.resting_hr && t('settings.estimated')}
                </Text>
              )}
              {zones.basis.lactate_threshold != null && (
                <Text style={styles.summaryText}>
                  {t('settings.lactateHR')}: {zones.basis.lactate_threshold} {t('common.bpm')}
                </Text>
              )}
            </View>

            <Text style={styles.hint}>
              {zones.method === 'lthr' ? t('settings.zonesLactate') : t('settings.zonesKarvonen')}
            </Text>
          </View> : null}

        {!zones && <Text style={styles.hint}>{t('settings.zonesNoAge')}</Text>}

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
  hint: {fontSize: 13, color: theme.colors.text.iosMuted, marginTop: 8, lineHeight: 18},

  sectionTitle: {fontSize: 20, fontWeight: '800', color: theme.colors.text.primary, marginBottom: 12, letterSpacing: -0.3},
  zonesCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    paddingHorizontal: 16,
    ...theme.shadows.card,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  zoneRowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.garage.divider,
  },
  zoneDot: {width: 9, height: 9, borderRadius: 4.5},
  zoneName: {flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text.primary},
  zoneRange: {fontSize: 14, fontWeight: '600', color: theme.colors.text.iosMuted},

  summaryCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: 16,
    marginTop: 12,
    ...theme.shadows.card,
  },
  summaryText: {fontSize: 14, color: theme.colors.text.primary, marginBottom: 6, fontWeight: '500'},

  saveButton: {marginTop: 16},
}));
