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

interface UserProfile {
  experience_level?: string;
  time_available?: number;
  workouts_per_week?: number;
}

export const TrainingSettingsScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {t} = useTranslation();
  const [profile, setProfile] = useState<UserProfile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const experienceLevels = [
    {value: 'beginner', label: t('settings.beginner')},
    {value: 'intermediate', label: t('settings.intermediate')},
    {value: 'advanced', label: t('settings.advanced')},
  ];

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setProfile({
        experience_level: data.experience_level || 'intermediate',
        time_available: data.time_available,
        workouts_per_week: data.workouts_per_week,
      });
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert(t('common.error'), t('settings.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(profile),
      });
      Alert.alert(t('common.success'), t('settings.trainingUpdated'));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.trainingFailed'));
    } finally {
      setSaving(false);
    }
  };

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
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('settings.trainingTitle')}</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.experienceLevel')}</Text>
          <View style={styles.segmentedControl}>
            {experienceLevels.map((level) => (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.segment,
                  profile.experience_level === level.value && styles.segmentActive,
                ]}
                onPress={() => setProfile({...profile, experience_level: level.value})}>
                <Text
                  style={[
                    styles.segmentText,
                    profile.experience_level === level.value && styles.segmentTextActive,
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
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.workoutsPerWeek')}</Text>
          <TextInput
            style={styles.input}
            value={profile.workouts_per_week?.toString() || ''}
            onChangeText={(text) =>
              setProfile({...profile, workouts_per_week: parseInt(text) || undefined})
            }
            placeholder="3"
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}>
          <Text style={styles.saveButtonText}>
            {saving ? t('common.saving') : t('common.save')}
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
  segmentedControl: {
    flexDirection: 'column',
    gap: 8,
  },
  segment: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  segmentActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  segmentText: {
    fontSize: 17,
    color: '#000',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
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

