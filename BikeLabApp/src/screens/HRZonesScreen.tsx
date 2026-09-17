import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {apiFetch} from '../utils/api';
import {PrimaryButton} from '../components/PrimaryButton';
import {logger} from '../lib/logger';
import type {UserProfile} from '@bikelab/shared/types';
import {computeHrZones, type HrZones} from '@bikelab/shared/calc';

export const HRZonesScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {t} = useTranslation();
  const [profile, setProfile] = useState<UserProfile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setProfile({
        max_hr: data.max_hr,
        resting_hr: data.resting_hr,
        lactate_threshold: data.lactate_threshold,
        age: data.age,
        experience_level: data.experience_level,
      });
    } catch (error) {
      logger.error('Error loading profile:', error);
      Alert.alert(t('common.error'), t('settings.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

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
    setSaving(true);
    try {
      await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          max_hr: profile.max_hr,
          resting_hr: profile.resting_hr,
          lactate_threshold: profile.lactate_threshold,
        }),
      });
      Alert.alert(t('common.success'), t('settings.hrUpdated'));
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.hrFailed'));
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1A1A1A" />
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
            onChangeText={(text) => setProfile({...profile, max_hr: parseInt(text) || undefined})}
            placeholder="190"
            placeholderTextColor="#C7C7CC"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>{t('settings.maxHRHint')}</Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.restingHR')}</Text>
          <TextInput
            style={styles.input}
            value={profile.resting_hr?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, resting_hr: parseInt(text) || undefined})}
            placeholder="60"
            placeholderTextColor="#C7C7CC"
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
              setProfile({...profile, lactate_threshold: parseInt(text) || undefined})
            }
            placeholder="165"
            placeholderTextColor="#C7C7CC"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>{t('settings.lactateHRHint')}</Text>
        </View>

        {zones && (
          <View style={styles.inputGroup}>
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
          </View>
        )}

        {!zones && <Text style={styles.hint}>{t('settings.zonesNoAge')}</Text>}

        <PrimaryButton
          title={saving ? t('common.saving') : t('common.save')}
          onPress={handleSave}
          loading={saving}
          style={styles.saveButton}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F5F5F5'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5'},

  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  backArrow: {fontSize: 32, color: '#1A1A1A', lineHeight: 34, fontWeight: '300', marginBottom: 4},
  title: {fontSize: 32, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.8},

  scroll: {flex: 1},
  form: {padding: 20, paddingBottom: 48},

  inputGroup: {marginBottom: 20},
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  hint: {fontSize: 13, color: '#8E8E93', marginTop: 8, lineHeight: 18},

  sectionTitle: {fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginBottom: 12, letterSpacing: -0.3},
  zonesCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  zoneRowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F2',
  },
  zoneDot: {width: 9, height: 9, borderRadius: 4.5},
  zoneName: {flex: 1, fontSize: 15, fontWeight: '700', color: '#1A1A1A'},
  zoneRange: {fontSize: 14, fontWeight: '600', color: '#8E8E93'},

  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryText: {fontSize: 14, color: '#1A1A1A', marginBottom: 6, fontWeight: '500'},

  saveButton: {marginTop: 16},
});
