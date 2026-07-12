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
  height?: number;
  weight?: string;
  age?: number;
  gender?: string;
  bike_weight?: number;
}

export const PersonalInfoScreen: React.FC<{navigation: any}> = ({navigation}) => {
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
        height: data.height,
        weight: data.weight,
        age: data.age,
        gender: data.gender,
        bike_weight: data.bike_weight,
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
      Alert.alert(t('common.success'), t('settings.personalUpdated'));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.personalFailed'));
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
        <Text style={styles.title}>{t('settings.personalTitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.height')}</Text>
          <TextInput
            style={styles.input}
            value={profile.height?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, height: parseInt(text) || undefined})}
            placeholder="175"
            placeholderTextColor="#C7C7CC"
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
            placeholderTextColor="#C7C7CC"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.age')}</Text>
          <TextInput
            style={styles.input}
            value={profile.age?.toString() || ''}
            onChangeText={(text) => setProfile({...profile, age: parseInt(text) || undefined})}
            placeholder="30"
            placeholderTextColor="#C7C7CC"
            keyboardType="numeric"
          />
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
            placeholderTextColor="#C7C7CC"
            keyboardType="decimal-pad"
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
  // Single solid color, no highlighted word — per explicit design direction.
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

  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E9E9EC',
    borderRadius: 100,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#274dd3',
  },
  segmentText: {fontSize: 15, fontWeight: '600', color: '#8E8E93'},
  segmentTextActive: {color: '#fff', fontWeight: '700'},

  saveButton: {marginTop: 16},
});
