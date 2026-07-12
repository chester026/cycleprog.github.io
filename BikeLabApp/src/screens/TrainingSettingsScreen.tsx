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
            placeholderTextColor="#C7C7CC"
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
            placeholderTextColor="#C7C7CC"
            keyboardType="numeric"
          />
        </View>

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

  levelStack: {gap: 10},
  levelRow: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  levelRowActive: {
    backgroundColor: '#274dd3',
    shadowColor: '#274dd3',
    shadowOpacity: 0.3,
  },
  levelText: {fontSize: 16, fontWeight: '700', color: '#1A1A1A'},
  levelTextActive: {color: '#fff'},

  saveButton: {marginTop: 16},
});
