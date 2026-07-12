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

interface UserProfile {
  max_hr?: number;
  resting_hr?: number;
  lactate_threshold?: number;
  age?: number;
  experience_level?: string;
}

interface HRZones {
  maxHR: number;
  restingHR: number;
  lactateThreshold?: number;
  zone1: {min: number; max: number};
  zone2: {min: number; max: number};
  zone3: {min: number; max: number};
  zone4: {min: number; max: number};
  zone5: {min: number; max: number};
}

const ZONE_COLORS = ['#4CAF50', '#8BC34A', '#FFC107', '#FF9800', '#F44336'];

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
      console.error('Error loading profile:', error);
      Alert.alert(t('common.error'), t('settings.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const calculateHeartRateZones = (): HRZones | null => {
    const maxHR = profile.max_hr || (profile.age ? 220 - profile.age : null);

    let restingHR = profile.resting_hr || null;
    if (!restingHR && profile.experience_level) {
      switch (profile.experience_level) {
        case 'beginner':
          restingHR = 75;
          break;
        case 'intermediate':
          restingHR = 65;
          break;
        case 'advanced':
          restingHR = 55;
          break;
        default:
          restingHR = 70;
      }
    }

    const lactateThreshold = profile.lactate_threshold || null;

    if (!maxHR || !restingHR) return null;

    if (lactateThreshold) {
      return {
        maxHR,
        restingHR,
        lactateThreshold,
        zone1: {min: Math.round(lactateThreshold * 0.75), max: Math.round(lactateThreshold * 0.85)},
        zone2: {min: Math.round(lactateThreshold * 0.85), max: Math.round(lactateThreshold * 0.92)},
        zone3: {min: Math.round(lactateThreshold * 0.92), max: Math.round(lactateThreshold * 0.97)},
        zone4: {min: Math.round(lactateThreshold * 0.97), max: Math.round(lactateThreshold * 1.03)},
        zone5: {min: Math.round(lactateThreshold * 1.03), max: maxHR},
      };
    } else {
      const hrReserve = maxHR - restingHR;
      return {
        maxHR,
        restingHR,
        zone1: {min: Math.round(restingHR + hrReserve * 0.5), max: Math.round(restingHR + hrReserve * 0.6)},
        zone2: {min: Math.round(restingHR + hrReserve * 0.6), max: Math.round(restingHR + hrReserve * 0.7)},
        zone3: {min: Math.round(restingHR + hrReserve * 0.7), max: Math.round(restingHR + hrReserve * 0.8)},
        zone4: {min: Math.round(restingHR + hrReserve * 0.8), max: Math.round(restingHR + hrReserve * 0.9)},
        zone5: {min: Math.round(restingHR + hrReserve * 0.9), max: maxHR},
      };
    }
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
      console.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.hrFailed'));
    } finally {
      setSaving(false);
    }
  };

  const zones = calculateHeartRateZones();
  const zoneRows = zones
    ? [
        {key: 'zone1', label: t('settings.zone1'), range: zones.zone1, color: ZONE_COLORS[0]},
        {key: 'zone2', label: t('settings.zone2'), range: zones.zone2, color: ZONE_COLORS[1]},
        {key: 'zone3', label: t('settings.zone3'), range: zones.zone3, color: ZONE_COLORS[2]},
        {key: 'zone4', label: t('settings.zone4'), range: zones.zone4, color: ZONE_COLORS[3]},
        {key: 'zone5', label: t('settings.zone5'), range: zones.zone5, color: ZONE_COLORS[4]},
      ]
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
                {t('settings.maxHR')}: {zones.maxHR} {t('common.bpm')} {!profile.max_hr && t('settings.estimated')}
              </Text>
              <Text style={styles.summaryText}>
                {t('settings.restingHR')}: {zones.restingHR} {t('common.bpm')} {!profile.resting_hr && t('settings.estimated')}
              </Text>
              {zones.lactateThreshold && (
                <Text style={styles.summaryText}>
                  {t('settings.lactateHR')}: {zones.lactateThreshold} {t('common.bpm')}
                </Text>
              )}
            </View>

            <Text style={styles.hint}>
              {zones.lactateThreshold ? t('settings.zonesLactate') : t('settings.zonesKarvonen')}
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
