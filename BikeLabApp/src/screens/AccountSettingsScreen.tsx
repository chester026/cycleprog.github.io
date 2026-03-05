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
  email?: string;
}

export const AccountSettingsScreen: React.FC<{navigation: any}> = ({navigation}) => {
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
        email: data.email,
      });
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert(t('common.error'), t('settings.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (profile.email && !profile.email.includes('@')) {
      Alert.alert(t('common.error'), t('settings.invalidEmail'));
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/api/user-profile', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(profile),
      });
      Alert.alert(t('common.success'), t('settings.accountUpdated'));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.accountFailed'));
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
        <Text style={styles.title}>{t('settings.accountTitle')}</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.emailAddress')}</Text>
          <TextInput
            style={styles.input}
            value={profile.email || ''}
            onChangeText={(text) => setProfile({...profile, email: text})}
            placeholder="your.email@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            {t('settings.emailHint')}
          </Text>
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
  hint: {
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 8,
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

