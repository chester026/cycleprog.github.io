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

export const AccountSettingsScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // T-5.1/A-17: shared useProfile()/useUpdateProfile() cache entry instead
  // of this screen's own apiFetch('/api/user-profile') GET/PUT pair.
  const profileQuery = useProfile();
  const updateProfile = useUpdateProfile();
  const [profile, setProfile] = useState<UserProfile>({});

  useEffect(() => {
    if (profileQuery.data) {
      setProfile({email: profileQuery.data.email});
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
    if (profile.email && !profile.email.includes('@')) {
      Alert.alert(t('common.error'), t('settings.invalidEmail'));
      return;
    }

    try {
      await updateProfile.mutateAsync({email: profile.email});
      Alert.alert(t('common.success'), t('settings.accountUpdated'));
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving profile:', error);
      Alert.alert(t('common.error'), t('settings.accountFailed'));
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
        <Text style={styles.title}>{t('settings.accountTitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t('settings.emailAddress')}</Text>
          <TextInput
            style={styles.input}
            value={profile.email || ''}
            onChangeText={(text) => setProfile({...profile, email: text})}
            placeholder={t('settings.emailPlaceholder')}
            placeholderTextColor="#C7C7CC"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>{t('settings.emailHint')}</Text>
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
  root: {flex: 1, backgroundColor: '#F5F5F5'},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5'},

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
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text.primary,
    ...theme.shadows.card,
  },
  hint: {fontSize: 13, color: '#8E8E93', marginTop: 8, lineHeight: 18},

  saveButton: {marginTop: 16},
}));
