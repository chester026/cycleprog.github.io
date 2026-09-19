import React, {useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from 'react-native';
import {startStravaLink} from '../auth/strava';
import {PrimaryButton} from '../components/PrimaryButton';
import {PulseIcon} from '../assets/img/icons/PulseIcon';
import {logger} from '../lib/logger';
import {useStravaStatus, useUnlinkStrava} from '../data/hooks/useStravaStatus';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';

export const StravaIntegrationScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // T-5.1/A-01/A-17: shared useStravaStatus() (a thin selector over
  // useProfile()) instead of this screen's own apiFetch('/api/user-profile').
  const {status, isLoading, isError, error, refetch} = useStravaStatus();
  const unlinkStrava = useUnlinkStrava();

  useEffect(() => {
    if (isError) {
      logger.error('Error loading profile:', error);
      Alert.alert(t('common.error'), t('strava.failedLoad'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  // App.tsx's deep-link handler emits this after `bikelab://strava-linked`
  // comes back from the OAuth round-trip (see src/auth/strava.ts). It never
  // touches the session token or navigation — we just refresh our own
  // status and tell the rider whether linking worked.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'strava-linked',
      (event: {ok: boolean; error?: string}) => {
        if (event.ok) {
          refetch();
        } else {
          Alert.alert(t('common.error'), t('strava.stravaFailed'));
        }
      },
    );
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLinkStrava = async () => {
    try {
      // Previously used the LOGIN redirect (/exchange_token?mobile=true) —
      // that logs the rider into whatever account is attached to that
      // Strava id instead of linking Strava to the account they're already
      // in. See docs/audit/layers/02-bikelabapp.md A-01.
      await startStravaLink();
    } catch (err) {
      logger.error('Failed to open Strava URL:', err);
      Alert.alert(t('common.error'), t('strava.stravaFailed'));
    }
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
              await unlinkStrava.mutateAsync();
              Alert.alert(t('common.success'), t('strava.unlinkSuccess'));
            } catch (error) {
              logger.error('Error unlinking Strava:', error);
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

  if (isLoading) {
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
        <Text style={styles.title}>{t('strava.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('strava.description')}</Text>

        {status.connected ? (
          <View style={styles.section}>
            <View style={styles.statusCard}>
              <View style={[styles.statusIconWrap, styles.statusIconOk]}>
                <Text style={styles.statusIconCheck}>✓</Text>
              </View>
              <Text style={styles.statusText}>{t('strava.connected')}</Text>
            </View>

            {status.athleteName ? <View style={styles.profileCard}>
                <View style={styles.profileIconWrap}>
                  <PulseIcon size={20} color={theme.colors.text.inverse} />
                </View>
                <View style={styles.profileTextWrap}>
                  <Text style={styles.profileName}>{status.athleteName}</Text>
                  <Text style={styles.profileId}>{t('strava.stravaId')}{status.stravaId}</Text>
                </View>
              </View> : null}

            <PrimaryButton
              title={t('strava.unlink')}
              onPress={handleUnlinkStrava}
              variant="danger"
              loading={unlinkStrava.isPending}
            />
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
  content: {padding: 20, paddingBottom: 48},
  description: {fontSize: 15, color: '#8E8E93', marginBottom: 20, lineHeight: 21},

  section: {gap: 16},

  statusCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...theme.shadows.card,
  },
  statusIconWrap: {width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center'},
  statusIconOk: {backgroundColor: '#22c55e'},
  statusIconCheck: {color: theme.colors.text.inverse, fontSize: 15, fontWeight: '800'},
  statusText: {fontSize: 16, fontWeight: '700', color: theme.colors.text.primary},

  profileCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...theme.shadows.card,
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
  profileName: {fontSize: 17, fontWeight: '800', color: theme.colors.text.primary, marginBottom: 2},
  profileId: {fontSize: 13, color: '#8E8E93', fontWeight: '500'},

  benefitsCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: 20,
    ...theme.shadows.card,
  },
  benefitsTitle: {fontSize: 18, fontWeight: '800', color: theme.colors.text.primary, marginBottom: 16, letterSpacing: -0.3},
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
  benefitText: {fontSize: 15, fontWeight: '700', color: theme.colors.text.primary, flex: 1},
}));
