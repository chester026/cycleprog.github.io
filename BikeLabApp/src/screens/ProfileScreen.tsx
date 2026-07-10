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
import {SvgXml} from 'react-native-svg';

const POWERED_BY_STRAVA_SVG = `<svg width="176" height="60" viewBox="0 0 176 60" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M0.997728 12.9365H2.78645V8.40394H5.77344C8.361 8.40394 9.88923 6.97991 9.88923 4.60074C9.88923 2.23893 8.361 0.78017 5.7908 0.78017H0.997728V12.9365ZM2.78645 6.73678V2.44733H5.72134C7.31903 2.44733 8.10051 3.14198 8.10051 4.60074C8.10051 6.02477 7.30167 6.73678 5.70397 6.73678H2.78645ZM17.8991 13.197C21.025 13.197 23.0916 10.6789 23.0916 6.85835C23.0916 3.03778 21.025 0.519677 17.8991 0.519677C14.7732 0.519677 12.724 3.03778 12.724 6.85835C12.724 10.6789 14.7732 13.197 17.8991 13.197ZM17.8991 11.5299C15.7978 11.5299 14.5127 9.75851 14.5127 6.85835C14.5127 3.95819 15.7978 2.18683 17.8991 2.18683C20.0178 2.18683 21.3029 3.95819 21.3029 6.85835C21.3029 9.75851 20.0178 11.5299 17.8991 11.5299ZM28.124 12.9365H30.1732L32.9692 3.61086H33.0039L35.7825 12.9365H37.8491L40.1762 0.78017H38.3527L36.6161 10.0885H36.5814L33.8202 0.78017H32.1356L29.3918 10.0885H29.357L27.6204 0.78017H25.7796L28.124 12.9365ZM43.6196 12.9365H51.0697V11.2694H45.4083V7.48353H50.5834V5.88584H45.4083V2.44733H51.0697V0.78017H43.6196V12.9365ZM60.9085 8.05662C62.6972 7.65719 63.7565 6.35473 63.7565 4.47917C63.7565 2.16947 62.2109 0.78017 59.6755 0.78017H55.0908V12.9365H56.8795V8.19555H59.0155L61.5163 12.9365H63.5308L60.9085 8.07398V8.05662ZM56.8795 6.54575V2.44733H59.5018C61.1342 2.44733 61.9678 3.12461 61.9678 4.47917C61.9678 5.83374 61.1169 6.54575 59.5018 6.54575H56.8795ZM67.4778 12.9365H74.9279V11.2694H69.2665V7.48353H74.4416V5.88584H69.2665V2.44733H74.9279V0.78017H67.4778V12.9365ZM78.949 12.9365H82.7869C85.9823 12.9365 88.1183 10.9915 88.1183 6.84098C88.1183 3.02041 85.9823 0.78017 82.8564 0.78017H78.949V12.9365ZM80.7377 11.2694V2.44733H82.8043C84.9577 2.44733 86.3296 3.92346 86.3296 6.84098C86.3296 10.0016 84.9577 11.2694 82.7175 11.2694H80.7377ZM98.33 12.9365H102.828C105.711 12.9365 107.204 11.6862 107.204 9.28962C107.204 7.91769 106.492 6.85835 105.398 6.42419V6.38946C106.232 5.97267 106.753 5.08699 106.753 3.95819C106.753 2.06527 105.311 0.78017 103.192 0.78017H98.33V12.9365ZM100.119 5.83374V2.42996H102.897C104.252 2.42996 104.964 3.00305 104.964 4.11448C104.964 5.26065 104.287 5.83374 102.897 5.83374H100.119ZM100.119 11.2867V7.3446H102.863C104.651 7.3446 105.415 7.93505 105.415 9.27225C105.415 10.6789 104.634 11.2867 102.828 11.2867H100.119ZM113.105 12.9365H114.893V7.90032L119.079 0.78017H117.082L114.008 6.23316H113.973L110.899 0.78017H108.902L113.105 7.90032V12.9365Z" fill="#8e8e93"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M93.6921 57.7137L93.6911 57.7123H102.972L108.673 46.2495L114.373 57.7123H125.651L108.672 24.9302L92.5543 56.0524L86.3661 47.0167C90.1869 45.1741 92.5685 41.9828 92.5685 37.3987V37.3085C92.5685 34.073 91.5802 31.7356 89.6922 29.8477C87.4897 27.6455 83.9392 26.2523 78.3664 26.2523H62.995V57.7137H73.5122V48.7246H75.7594L81.6921 57.7137H93.6921ZM158.547 24.9302L141.57 57.7123H152.848L158.549 46.2495L164.25 57.7123H175.527L158.547 24.9302ZM133.62 59.0022L150.597 26.22H139.32L133.619 37.6829L127.918 26.22H116.641L133.62 59.0022ZM78.0518 41.2191C80.5682 41.2191 82.0966 40.0956 82.0966 38.163V38.0728C82.0966 36.0504 80.5232 35.0617 78.0967 35.0617H73.5122V41.2191H78.0518ZM40.5035 35.1512H31.2453V26.2523H60.2792V35.1512H51.0211V57.7137H40.5035V35.1512ZM5.61851 46.2977L0 52.9945C4.00023 56.5007 9.75321 58.2981 16.135 58.2981C24.5849 58.2981 30.0233 54.2529 30.0233 47.6456V47.5561C30.0233 41.2189 24.6298 38.8815 16.5848 37.3988C13.2587 36.7689 12.4048 36.2303 12.4048 35.376V35.2861C12.4048 34.5221 13.1242 33.9828 14.6969 33.9828C17.6181 33.9828 21.1693 34.9266 24.1351 37.0838L29.2593 29.9829C25.6186 27.1063 21.1243 25.6678 15.0568 25.6678C6.38181 25.6678 1.70781 30.2975 1.70781 36.2749V36.3651C1.70781 43.0166 7.91057 45.0397 14.9665 46.4771C18.3376 47.1516 19.3259 47.6456 19.3259 48.5448V48.6351C19.3259 49.4886 18.5173 49.9826 16.6294 49.9826C12.9441 49.9826 9.03413 48.9047 5.61851 46.2977Z" fill="#8e8e93"/>
</svg>`;

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
        />
        <SettingsItem
          icon=""
          title={t('profile.appleHealthIntegration')}
          subtitle={t('profile.appleHealthIntegrationSub')}
          onPress={() => navigation.navigate('AppleHealth' as never)}
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

      <SectionHeader title={t('profile.account')} />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title={t('profile.signOut')}
          onPress={handleSignOut}
          hideDivider={false}
        />
         <View style={styles.footer}>
        <SvgXml xml={POWERED_BY_STRAVA_SVG} width={100} height={34} />
        <Text style={styles.footerVersion}>{t('profile.version')}</Text>
      </View>
        <TouchableOpacity style={styles.deleteAccountRow} onPress={handleDeleteAccount} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator size="small" color="#ff3b30" />
          ) : (
            <Text style={styles.deleteAccountText}>{t('profile.deleteAccount')}</Text>
          )}
        </TouchableOpacity>
      </View>

     
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
    paddingBottom: 42,
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
    fontWeight: '500',
    fontSize: 14,
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
  deleteAccountRow: {
    alignItems: 'center',
    paddingVertical: 24,
    marginVertical: 32,
    paddingHorizontal: 16,
    backgroundColor: '#f1f0f0',
  },
  deleteAccountText: {
    fontSize: 14,
    color: '#ff3b30',
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    opacity: 0.5,
   
  },
  footerVersion: {
    fontSize: 13,
    color: '#8e8e93',
  },
});

