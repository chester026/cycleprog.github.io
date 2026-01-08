import React, {useState, useEffect} from 'react';
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

export const HRZonesScreen: React.FC<{navigation: any}> = ({navigation}) => {
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
      Alert.alert('Error', 'Failed to load profile');
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
      Alert.alert('Success', 'Heart rate zones updated successfully!');
      navigation.goBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to update HR zones. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const zones = calculateHeartRateZones();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Heart Rate Zones</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Maximum Heart Rate (bpm)</Text>
          <TextInput
            style={styles.input}
            value={profile.max_hr?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, max_hr: parseInt(text) || undefined})}
            placeholder="190"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>
            Leave empty to estimate based on age (220 - age)
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Resting Heart Rate (bpm)</Text>
          <TextInput
            style={styles.input}
            value={profile.resting_hr?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, resting_hr: parseInt(text) || undefined})}
            placeholder="60"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>
            Leave empty to estimate based on experience level
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Lactate Threshold HR (bpm)</Text>
          <TextInput
            style={styles.input}
            value={profile.lactate_threshold?.toString() || ''}
            onChangeText={(text) =>
              setProfile({...profile, lactate_threshold: parseInt(text) || undefined})
            }
            placeholder="165"
            keyboardType="numeric"
          />
          <Text style={styles.hint}>
            Optional: from lactate test or FTP test for more accurate zones
          </Text>
        </View>

        {zones && (
          <View style={styles.zonesContainer}>
            <Text style={styles.zonesTitle}>Current Heart Rate Zones</Text>

            <View style={styles.zoneCard}>
              <View style={[styles.zoneIndicator, {backgroundColor: '#4CAF50'}]} />
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>Zone 1 (Recovery)</Text>
                <Text style={styles.zoneRange}>
                  {zones.zone1.min} - {zones.zone1.max} bpm
                </Text>
              </View>
            </View>

            <View style={styles.zoneCard}>
              <View style={[styles.zoneIndicator, {backgroundColor: '#8BC34A'}]} />
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>Zone 2 (Endurance)</Text>
                <Text style={styles.zoneRange}>
                  {zones.zone2.min} - {zones.zone2.max} bpm
                </Text>
              </View>
            </View>

            <View style={styles.zoneCard}>
              <View style={[styles.zoneIndicator, {backgroundColor: '#FFC107'}]} />
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>Zone 3 (Tempo)</Text>
                <Text style={styles.zoneRange}>
                  {zones.zone3.min} - {zones.zone3.max} bpm
                </Text>
              </View>
            </View>

            <View style={styles.zoneCard}>
              <View style={[styles.zoneIndicator, {backgroundColor: '#FF9800'}]} />
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>Zone 4 (Threshold)</Text>
                <Text style={styles.zoneRange}>
                  {zones.zone4.min} - {zones.zone4.max} bpm
                </Text>
              </View>
            </View>

            <View style={styles.zoneCard}>
              <View style={[styles.zoneIndicator, {backgroundColor: '#F44336'}]} />
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>Zone 5 (VO2 Max)</Text>
                <Text style={styles.zoneRange}>
                  {zones.zone5.min} - {zones.zone5.max} bpm
                </Text>
              </View>
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                Max HR: {zones.maxHR} bpm {!profile.max_hr && '(estimated)'}
              </Text>
              <Text style={styles.summaryText}>
                Resting HR: {zones.restingHR} bpm {!profile.resting_hr && '(estimated)'}
              </Text>
              {zones.lactateThreshold && (
                <Text style={styles.summaryText}>
                  Lactate Threshold: {zones.lactateThreshold} bpm
                </Text>
              )}
            </View>

            <Text style={styles.hint}>
              {zones.lactateThreshold
                ? 'Zones calculated based on lactate threshold HR'
                : 'Zones calculated using Karvonen formula (HR Reserve)'}
            </Text>
          </View>
        )}

        {!zones && (
          <Text style={styles.hint}>
            Enter your age in Personal Information to see calculated zones
          </Text>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}>
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  backButton: {
    fontSize: 17,
    color: '#007AFF',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#000',
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    fontSize: 17,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  hint: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 8,
  },
  zonesContainer: {
    marginBottom: 24,
  },
  zonesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  zoneCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  zoneIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 16,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  zoneRange: {
    fontSize: 15,
    color: '#8e8e93',
  },
  summary: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  summaryText: {
    fontSize: 15,
    color: '#000',
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

