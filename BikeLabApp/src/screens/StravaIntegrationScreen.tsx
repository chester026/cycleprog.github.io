import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import {apiFetch} from '../utils/api';

interface UserProfile {
  strava_id?: string;
  name?: string;
  avatar?: string;
}

export const StravaIntegrationScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {t} = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiFetch('/api/user-profile');
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert(t('common.error'), t('strava.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkStrava = () => {
    const clientId = '165560';
    const redirectUri = 'https://bikelab.app/exchange_token?mobile=true';
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    
    console.log('🚴 Opening Strava OAuth...');
    console.log('📍 Redirect URI:', redirectUri);
    
    Linking.openURL(authUrl).catch((err) => {
      console.error('Failed to open Strava URL:', err);
      Alert.alert(t('common.error'), t('strava.stravaFailed'));
    });
  };

  const handleUnlinkStrava = async () => {
    Alert.alert(
      t('strava.unlinkConfirmTitle'),
      t('strava.unlinkConfirmMessage'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('strava.unlinkButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch('/api/unlink_strava', {method: 'POST'});
              Alert.alert(t('common.success'), t('strava.unlinkSuccess'));
              await loadProfile();
            } catch (error) {
              console.error('Error unlinking Strava:', error);
              Alert.alert(t('common.error'), t('strava.unlinkFailed'));
            }
          },
        },
      ],
    );
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
        <Text style={styles.title}>{t('strava.title')}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          {t('strava.description')}
        </Text>

        {profile?.strava_id ? (
          <View style={styles.connectedContainer}>
            <View style={styles.statusCard}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>{t('strava.connected')}</Text>
            </View>

            {profile.name && (
              <View style={styles.profileCard}>
                <Text style={styles.profileName}>{profile.name}</Text>
                <Text style={styles.profileId}>{t('strava.stravaId')}{profile.strava_id}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.unlinkButton} onPress={handleUnlinkStrava}>
              <Text style={styles.unlinkButtonText}>{t('strava.unlink')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.disconnectedContainer}>
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>{t('strava.benefits')}</Text>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🚴</Text>
                <Text style={styles.benefitText}>{t('strava.benefitSync')}</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>📊</Text>
                <Text style={styles.benefitText}>{t('strava.benefitAnalytics')}</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🎯</Text>
                <Text style={styles.benefitText}>{t('strava.benefitPlans')}</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🏆</Text>
                <Text style={styles.benefitText}>{t('strava.benefitGoals')}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.linkButton} onPress={handleLinkStrava}>
              <Text style={styles.linkButtonText}>{t('strava.connect')}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  content: {
    padding: 16,
  },
  description: {
    fontSize: 17,
    color: '#000',
    marginBottom: 24,
    lineHeight: 24,
  },
  connectedContainer: {
    gap: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  statusIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  statusText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  profileId: {
    fontSize: 15,
    color: '#8e8e93',
  },
  unlinkButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  unlinkButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  disconnectedContainer: {
    gap: 24,
  },
  benefitsCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  benefitsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  benefitText: {
    fontSize: 17,
    color: '#000',
  },
  linkButton: {
    backgroundColor: '#FC4C02',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

