import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTranslation} from 'react-i18next';
import {changeLanguage} from '../i18n/i18n';
import {apiFetch, TokenStorage} from '../utils/api';
import {resetToLogin} from '../../App';

interface UserProfile {
  id: number;
  name?: string;
  avatar?: string;
  age?: number;
  weight?: string;
  height?: number;
  experience_level?: string;
  time_available?: number;
  workouts_per_week?: number;
  max_hr?: number;
  resting_hr?: number;
  lactate_threshold?: number;
}

export const ProfileScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {t, i18n} = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);
  
  // Debug log
  useEffect(() => {
    if (profile) {
      console.log('👤 Profile loaded:', {
        name: profile.name,
        avatar: profile.avatar,
        experience_level: profile.experience_level,
        age: profile.age,
        weight: profile.weight,
        height: profile.height,
      });
    }
  }, [profile]);

  const loadProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageToggle = () => {
    const newLang = i18n.language === 'ru' ? 'en' : 'ru';
    changeLanguage(newLang);
  };

  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountConfirm'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('profile.deleteAccount'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile.deleteAccountFinal'),
              t('profile.deleteAccountFinalConfirm'),
              [
                {text: t('common.cancel'), style: 'cancel'},
                {
                  text: t('profile.yesDelete'),
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await apiFetch('/api/account', {method: 'DELETE'});
                      await TokenStorage.removeToken();
                      await AsyncStorage.clear();
                      Alert.alert(t('profile.accountDeleted'), t('profile.accountDeletedMessage'), [
                        {text: t('common.ok'), onPress: () => resetToLogin()},
                      ]);
                    } catch (error) {
                      console.error('Error deleting account:', error);
                      Alert.alert(t('common.error'), t('profile.deleteAccountFailed'));
                    } finally {
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      t('profile.signOut'),
      t('profile.signOutConfirm'),
      [
        {text: t('common.cancel'), style: 'cancel'},
        {
          text: t('profile.signOut'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove all tokens
              await TokenStorage.removeToken();
              console.log('🚪 Token removed');
              
              // Clear ALL cache (для возможности логина в разные аккаунты)
              await AsyncStorage.clear();
              console.log('🗑️ All cache cleared');
              
              // Small delay to ensure everything is cleaned
              await new Promise<void>(resolve => setTimeout(() => resolve(), 100));
              
              // Then reset navigation
              resetToLogin();
            } catch (error) {
              console.error('Error during sign out:', error);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#274dd3" />
      </View>
    );
  }

  // Get name or fallback to 'User'
  const fullName = profile?.name || t('profile.user');
  
  const avatarLetter = fullName && fullName.length > 0 ? fullName.charAt(0).toUpperCase() : 'U';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          {profile?.avatar ? (
            <Image
              source={{uri: profile.avatar}}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>
                {avatarLetter}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.nameContainer}>
            <Text style={styles.name}>{fullName}</Text>
            {profile?.experience_level && (
            <Text style={styles.experience}>
                {profile.experience_level.charAt(0).toUpperCase() + profile.experience_level.slice(1)}{t('profile.cyclist')}
            </Text>
            )}
        </View>
      </View>

      {/* Settings Sections */}
      <SectionHeader title={t('profile.generalSettings')} />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.personalInfo')}
          subtitle={t('profile.personalInfoSub')}
          onPress={() => navigation.navigate('PersonalInfo' as never)}
        />
        <SettingsItem
          icon=""
          title={t('profile.accountSettings')}
          subtitle={t('profile.accountSettingsSub')}
          onPress={() => navigation.navigate('AccountSettings' as never)}
        />
        <SettingsItem
          icon=""
          title={t('profile.language')}
          subtitle={i18n.language === 'ru' ? 'Русский' : 'English'}
          onPress={handleLanguageToggle}
          hideDivider={false}
        />
      </View>

      <SectionHeader title={t('profile.fitnessData')} />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.hrZones')}
          subtitle={t('profile.hrZonesSub')}
          onPress={() => navigation.navigate('HRZones' as never)}
        />
        <SettingsItem
          icon=""
          title={t('profile.trainingSettings')}
          subtitle={t('profile.trainingSettingsSub')}
          onPress={() => navigation.navigate('TrainingSettings' as never)}
          hideDivider={false}
        />
      </View>

      <SectionHeader title={t('profile.achievements')} />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.achievements')}
          subtitle={t('profile.achievementsSub')}
          onPress={() => navigation.navigate('Achievements' as never)}
          hideDivider={true}
        />
      </View>

      <SectionHeader title={t('profile.integrations')} />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.stravaIntegration')}
          subtitle={t('profile.stravaIntegrationSub')}
          onPress={() => navigation.navigate('StravaIntegration' as never)}
          hideDivider={true}
        />
      </View>

      <SectionHeader title={t('profile.support')} />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.contactUs')}
          subtitle={t('profile.contactUsSub')}
          onPress={() => Alert.alert(t('profile.contactUs'), t('profile.comingSoon'))}
          hideDivider={true}
        />
      </View>

      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.signOut')}
          onPress={handleSignOut}
          isDestructive={true}
          hideDivider={true}
        />
      </View>

      <TouchableOpacity
        style={styles.deleteAccountButton}
        onPress={handleDeleteAccount}
        disabled={deleting}>
        {deleting ? (
          <ActivityIndicator size="small" color="#ff3b30" />
        ) : (
          <Text style={styles.deleteAccountText}>{t('profile.deleteAccount')}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.version}>{t('profile.version')}</Text>
    </ScrollView>
  );
};

interface SectionHeaderProps {
  title: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({title}) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
);

interface SettingsItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  hideDivider?: boolean;
  isDestructive?: boolean;
}

const SettingsItem: React.FC<SettingsItemProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  hideDivider = false,
  isDestructive = false,
}) => (
  <>
    <TouchableOpacity style={styles.settingsItem} onPress={onPress}>
      <View style={styles.settingsItemLeft}>
        <Text style={styles.settingsIcon}>{icon}</Text>
        <View style={styles.settingsTextContainer}>
          <Text style={[styles.settingsTitle, isDestructive && styles.destructiveText]}>
            {title}
          </Text>
          {subtitle && <Text style={styles.settingsSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {!isDestructive && <Text style={styles.chevron}>›</Text>}
    </TouchableOpacity>
    {!hideDivider && <View style={styles.divider} />}
  </>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8fa',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  header: {
    backgroundColor: '#f8f8fa',
    paddingTop: 80,
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20,
  },
  
  avatarContainer: {
    marginBottom: 0,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    backgroundColor: '#274dd3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#fff',
  },
  nameContainer: {
    marginLeft: 0,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  experience: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8e8e93',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#f8f8fa',
    marginTop: 8,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    paddingHorizontal: 16
  },
  settingsItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingsIcon: {
    fontSize: 24,
    marginRight: 0,
  },
  settingsTextContainer: {
    flex: 1,
    gap: 2,
  },
  settingsTitle: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  settingsSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8e8e93',
    marginTop: 2,
  },
  destructiveText: {
    color: '#ff3b30',
    fontWeight: '700',
    fontSize: 15,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 24,
  },
  chevron: {
    fontSize: 24,
    color: '#1a1a1a',
    fontWeight: '400',
  },
  divider: {
    height: 0,
    backgroundColor: '#c6c6c8',
    marginLeft: 52,
  },
  deleteAccountButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 24,
  },
  deleteAccountText: {
    fontSize: 14,
    color: '#ff3b30',
    fontWeight: '400',
  },
  version: {
    textAlign: 'center',
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 8,
  },
});

