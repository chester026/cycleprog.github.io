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

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              // Remove all tokens
              await TokenStorage.removeToken();
              console.log('🚪 All tokens removed, signing out...');
              
              // Small delay to ensure tokens are fully removed
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
  const fullName = profile?.name || 'User';
  
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
                {profile.experience_level.charAt(0).toUpperCase() + profile.experience_level.slice(1)} Cyclist
            </Text>
            )}
        </View>
      </View>

      {/* Settings Sections */}
      <SectionHeader title="General Settings" />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title="Personal Info"
          subtitle="Age, weight, height"
          onPress={() => navigation.navigate('PersonalInfo' as never)}
        />
        <SettingsItem
          icon=""
          title="Account Settings"
          subtitle="Email address"
          onPress={() => navigation.navigate('AccountSettings' as never)}
          hideDivider={false}
        />
      </View>

      <SectionHeader title="Fitness Data" />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title="HR Zones"
          subtitle="Heart rate zones configuration"
          onPress={() => navigation.navigate('HRZones' as never)}
        />
        <SettingsItem
          icon=""
          title="Training Settings"
          subtitle="Experience level, weekly schedule"
          onPress={() => navigation.navigate('TrainingSettings' as never)}
          hideDivider={false}
        />
      </View>

      <SectionHeader title="Integrations" />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title="Strava Integration"
          subtitle="Connected account"
          onPress={() => navigation.navigate('StravaIntegration' as never)}
          hideDivider={true}
        />
      </View>

      <SectionHeader title="Support" />
      <View style={styles.section}>
        <SettingsItem
          icon=""
          title="Contact Us"
          subtitle="Get help and support"
          onPress={() => Alert.alert('Contact Us', 'Coming soon!')}
          hideDivider={true}
        />
      </View>

      <View style={styles.section}>
        <SettingsItem
          icon=""
          title="Sign Out"
          onPress={handleSignOut}
          isDestructive={true}
          hideDivider={true}
        />
      </View>

      <Text style={styles.version}>Version 1.0.0</Text>
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
  version: {
    textAlign: 'center',
    fontSize: 13,
    color: '#8e8e93',
    marginTop: 32,
  },
});

