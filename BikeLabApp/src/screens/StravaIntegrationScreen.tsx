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
import {PrimaryButton} from '../components/PrimaryButton';
import {PulseIcon} from '../assets/img/icons/PulseIcon';

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

  const benefits = [
    {icon: '🚴', text: t('strava.benefitSync')},
    {icon: '📊', text: t('strava.benefitAnalytics')},
    {icon: '🎯', text: t('strava.benefitPlans')},
    {icon: '🏆', text: t('strava.benefitGoals')},
  ];

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
        <Text style={styles.title}>{t('strava.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('strava.description')}</Text>

        {profile?.strava_id ? (
          <View style={styles.section}>
            <View style={styles.statusCard}>
              <View style={[styles.statusIconWrap, styles.statusIconOk]}>
                <Text style={styles.statusIconCheck}>✓</Text>
              </View>
              <Text style={styles.statusText}>{t('strava.connected')}</Text>
            </View>

            {profile.name && (
              <View style={styles.profileCard}>
                <View style={styles.profileIconWrap}>
                  <PulseIcon size={20} color="#fff" />
                </View>
                <View style={styles.profileTextWrap}>
                  <Text style={styles.profileName}>{profile.name}</Text>
                  <Text style={styles.profileId}>{t('strava.stravaId')}{profile.strava_id}</Text>
                </View>
              </View>
            )}

            <PrimaryButton title={t('strava.unlink')} onPress={handleUnlinkStrava} variant="danger" />
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>{t('strava.benefits')}</Text>
              {benefits.map((b) => (
                <View key={b.text} style={styles.benefitItem}>
                  <View style={styles.benefitIconWrap}>
                    <Text style={styles.benefitIcon}>{b.icon}</Text>
                  </View>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>

            <PrimaryButton title={t('strava.connect')} onPress={handleLinkStrava} />
          </View>
        )}
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
  content: {padding: 20, paddingBottom: 48},
  description: {fontSize: 15, color: '#8E8E93', marginBottom: 20, lineHeight: 21},

  section: {gap: 16},

  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusIconWrap: {width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center'},
  statusIconOk: {backgroundColor: '#22c55e'},
  statusIconCheck: {color: '#fff', fontSize: 15, fontWeight: '800'},
  statusText: {fontSize: 16, fontWeight: '700', color: '#1A1A1A'},

  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FC4C02',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileTextWrap: {flex: 1},
  profileName: {fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 2},
  profileId: {fontSize: 13, color: '#8E8E93', fontWeight: '500'},

  benefitsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  benefitsTitle: {fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 16, letterSpacing: -0.3},
  benefitItem: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14},
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#EDEEFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitIcon: {fontSize: 16},
  benefitText: {fontSize: 15, fontWeight: '700', color: '#1A1A1A', flex: 1},
});
