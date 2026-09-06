import React, {useState, useEffect, useCallback} from 'react';
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

// Modeled on StravaIntegrationScreen.tsx (connect/disconnect shape, OAuth
// via Linking.openURL) crossed with AppleHealthScreen.tsx (metrics card +
// Refresh button). Unlike both of those, Oura is neither how the rider
// logs in (that's Strava-only) nor on-device-only (that's Apple Health) —
// it's a third, server-cached health-data source. See server/ouraService.js
// and server/routes/oura.js for the backend half of this flow.
interface OuraLatest {
  day: string;
  readiness_score: number | null;
  sleep_score: number | null;
  activity_score: number | null;
  total_sleep_hours: number | null;
  average_hrv: number | null;
  resting_heart_rate: number | null;
  min_heart_rate: number | null;
  stress_day_summary: 'restored' | 'normal' | 'stressful' | null;
  resilience_level: 'limited' | 'adequate' | 'solid' | 'strong' | 'exceptional' | null;
  spo2_average: number | null;
}

// Oura's day_summary/level fields are enums, not display strings — map
// each to its own i18n key rather than building a key name dynamically
// (keeps these translatable and typo-proof).
const STRESS_LABEL_KEYS: Record<string, string> = {
  restored: 'oura.stressRestored',
  normal: 'oura.stressNormal',
  stressful: 'oura.stressStressful',
};
const RESILIENCE_LABEL_KEYS: Record<string, string> = {
  limited: 'oura.resilienceLimited',
  adequate: 'oura.resilienceAdequate',
  solid: 'oura.resilienceSolid',
  strong: 'oura.resilienceStrong',
  exceptional: 'oura.resilienceExceptional',
};

interface OuraStatus {
  connected: boolean;
  ouraUserId: string | null;
  latest: OuraLatest | null;
}

export const OuraIntegrationScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {t} = useTranslation();
  const [status, setStatus] = useState<OuraStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/api/oura/status');
      setStatus(data);
    } catch (error) {
      console.error('[Oura] Error loading status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // App.tsx's global deep-link handler deliberately ignores bikelab://oura
  // (it's not an auth/token link like Strava's) — this screen owns
  // refreshing its own status when the rider comes back from the Oura
  // consent page in the system browser.
  useEffect(() => {
    const handleUrl = ({url}: {url: string}) => {
      if (url.includes('bikelab://oura')) {
        loadStatus();
      }
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, [loadStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const {authUrl} = await apiFetch('/api/oura/connect-state');
      await Linking.openURL(authUrl);
    } catch (error) {
      console.error('[Oura] Failed to start connect flow:', error);
      Alert.alert(t('common.error'), t('oura.connectFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await apiFetch('/api/oura/sync', {method: 'POST'});
      await loadStatus();
    } catch (error) {
      console.error('[Oura] Sync failed:', error);
      Alert.alert(t('common.error'), t('oura.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(t('oura.disconnectConfirmTitle'), t('oura.disconnectConfirmMessage'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('oura.disconnectButton'),
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch('/api/oura/unlink', {method: 'POST'});
            await loadStatus();
          } catch (error) {
            console.error('[Oura] Disconnect failed:', error);
            Alert.alert(t('common.error'), t('oura.disconnectFailed'));
          }
        },
      },
    ]);
  };

  const latest = status?.latest;
  const metricRows: {label: string; value: string | null}[] = latest
    ? [
        {
          label: t('oura.metricReadiness'),
          value: latest.readiness_score != null ? `${latest.readiness_score}/100` : null,
        },
        {
          label: t('oura.metricSleepScore'),
          value: latest.sleep_score != null ? `${latest.sleep_score}/100` : null,
        },
        {
          label: t('oura.metricSleepHours'),
          value: latest.total_sleep_hours != null ? `${latest.total_sleep_hours.toFixed(1)}h` : null,
        },
        {
          label: t('oura.metricHRV'),
          value: latest.average_hrv != null ? `${Math.round(latest.average_hrv)} ms` : null,
        },
        {
          label: t('oura.metricRestingHR'),
          value: latest.resting_heart_rate != null ? `${Math.round(latest.resting_heart_rate)} bpm` : null,
        },
        {
          label: t('oura.metricMinHR'),
          value: latest.min_heart_rate != null ? `${Math.round(latest.min_heart_rate)} bpm` : null,
        },
        {
          label: t('oura.metricStress'),
          value:
            latest.stress_day_summary && STRESS_LABEL_KEYS[latest.stress_day_summary]
              ? t(STRESS_LABEL_KEYS[latest.stress_day_summary])
              : null,
        },
        {
          label: t('oura.metricResilience'),
          value:
            latest.resilience_level && RESILIENCE_LABEL_KEYS[latest.resilience_level]
              ? t(RESILIENCE_LABEL_KEYS[latest.resilience_level])
              : null,
        },
        {
          label: t('oura.metricSpo2'),
          value: latest.spo2_average != null ? `${latest.spo2_average.toFixed(1)}%` : null,
        },
      ]
    : [];

  const benefits = [
    {icon: '🌙', text: t('oura.benefitSleep')},
    {icon: '⚡', text: t('oura.benefitReadiness')},
    {icon: '❤️', text: t('oura.benefitHRV')},
    {icon: '🎯', text: t('oura.benefitCoaching')},
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
        <Text style={styles.title}>{t('oura.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('oura.description')}</Text>

        {status?.connected ? (
          <View style={styles.section}>
            <View style={styles.statusCard}>
              <View style={[styles.statusIconWrap, styles.statusIconOk]}>
                <Text style={styles.statusIconCheck}>✓</Text>
              </View>
              <Text style={styles.statusText}>{t('oura.connected')}</Text>
            </View>

            <View style={styles.metricsCard}>
              {metricRows.map((row, i) => (
                <View key={row.label} style={[styles.metricRow, i > 0 && styles.rowDivider]}>
                  <Text style={styles.metricLabel}>{row.label}</Text>
                  <Text style={styles.metricValue}>{row.value ?? t('oura.noDataYet')}</Text>
                </View>
              ))}
            </View>

            <PrimaryButton
              title={t('oura.refresh')}
              onPress={handleSync}
              loading={syncing}
              variant="secondary"
            />

            <PrimaryButton
              title={t('oura.disconnect')}
              onPress={handleDisconnect}
              variant="danger"
              style={styles.secondSpacing}
            />
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>{t('oura.benefits')}</Text>
              {benefits.map((b) => (
                <View key={b.text} style={styles.benefitItem}>
                  <View style={styles.benefitIconWrap}>
                    <Text style={styles.benefitIcon}>{b.icon}</Text>
                  </View>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>

            <PrimaryButton title={t('oura.connect')} onPress={handleConnect} loading={connecting} />
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

  metricsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  metricRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13},
  rowDivider: {borderTopWidth: 1, borderTopColor: '#F0F0F2'},
  metricLabel: {fontSize: 14, color: '#1A1A1A', fontWeight: '500'},
  metricValue: {fontSize: 14, fontWeight: '700', color: '#8E8E93'},

  secondSpacing: {marginTop: -4},

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
