import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform} from 'react-native';
import {useHealthData} from '../hooks/useHealthData';
import {PrimaryButton} from '../components/PrimaryButton';

// Modeled directly on StravaIntegrationScreen.tsx (same header/content shape,
// same connected-vs-disconnected branching) since that's the app's existing
// integration-screen precedent — see APPLE_HEALTH_IMPLEMENTATION_PLAN.md §1.
export const AppleHealthScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {t} = useTranslation();
  const {snapshot, isLoading, isConnected, connect, disconnect, refresh} = useHealthData();
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const started = await connect();
      if (!started) {
        Alert.alert(t('common.error'), t('appleHealth.connectFailed'));
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(t('appleHealth.disconnectConfirmTitle'), t('appleHealth.disconnectConfirmMessage'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('appleHealth.disconnectButton'), style: 'destructive', onPress: () => disconnect()},
    ]);
  };

  const metricRows: {label: string; value: string | null}[] = isConnected
    ? [
        {
          label: t('appleHealth.metricRecovery'),
          value: snapshot?.recoveryScore != null ? `${snapshot.recoveryScore}/100` : null,
        },
        {
          label: t('appleHealth.metricRestingHR'),
          value: snapshot?.restingHR != null ? `${Math.round(snapshot.restingHR)} bpm` : null,
        },
        {label: t('appleHealth.metricHRV'), value: snapshot?.hrv != null ? `${Math.round(snapshot.hrv)} ms` : null},
        {
          label: t('appleHealth.metricSleep'),
          value: snapshot?.sleepHours != null ? `${snapshot.sleepHours.toFixed(1)}h` : null,
        },
        {
          label: t('appleHealth.metricWeight'),
          value: snapshot?.weightKg != null ? `${snapshot.weightKg.toFixed(1)} kg` : null,
        },
        {
          label: t('appleHealth.metricVo2Max'),
          value: snapshot?.vo2max != null ? snapshot.vo2max.toFixed(1) : null,
        },
      ]
    : [];

  const benefits = [
    {icon: '⚡', text: t('appleHealth.benefitRecovery')},
    {icon: '🌙', text: t('appleHealth.benefitSleep')},
    {icon: '🎯', text: t('appleHealth.benefitReadiness')},
    {icon: '🔒', text: t('appleHealth.benefitPrivacy')},
  ];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('appleHealth.title')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('appleHealth.description')}</Text>

        {Platform.OS !== 'ios' ? (
          <View style={styles.statusCard}>
            <View style={[styles.statusIconWrap, styles.statusIconInfo]}>
              <Text style={styles.statusIconText}>i</Text>
            </View>
            <Text style={styles.statusText}>{t('appleHealth.iosOnly')}</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator size="large" color="#1A1A1A" style={{marginTop: 24}} />
        ) : isConnected ? (
          <View style={styles.section}>
            <View style={styles.statusCard}>
              <View style={[styles.statusIconWrap, styles.statusIconOk]}>
                <Text style={styles.statusIconCheck}>✓</Text>
              </View>
              <Text style={styles.statusText}>{t('appleHealth.connected')}</Text>
            </View>

            <View style={styles.metricsCard}>
              {metricRows.map((row, i) => (
                <View key={row.label} style={[styles.metricRow, i > 0 && styles.rowDivider]}>
                  <Text style={styles.metricLabel}>{row.label}</Text>
                  <Text style={styles.metricValue}>{row.value ?? t('appleHealth.noDataYet')}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.privacyNote}>{t('appleHealth.privacyNote')}</Text>

            <PrimaryButton
              title={t('appleHealth.refresh')}
              onPress={handleRefresh}
              loading={refreshing}
              variant="secondary"
            />

            <PrimaryButton
              title={t('appleHealth.disconnect')}
              onPress={handleDisconnect}
              variant="danger"
              style={styles.secondSpacing}
            />
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>{t('appleHealth.benefits')}</Text>
              {benefits.map((b) => (
                <View key={b.text} style={styles.benefitItem}>
                  <View style={styles.benefitIconWrap}>
                    <Text style={styles.benefitIcon}>{b.icon}</Text>
                  </View>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>

            <PrimaryButton
              title={t('appleHealth.connect')}
              onPress={handleConnect}
              loading={connecting}
            />

            <Text style={styles.privacyNote}>{t('appleHealth.privacyNote')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F5F5F5'},

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
    marginBottom: 16,
    shadowColor: '#10101E',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statusIconWrap: {width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center'},
  statusIconOk: {backgroundColor: '#22c55e'},
  statusIconInfo: {backgroundColor: '#8E8E93'},
  statusIconCheck: {color: '#fff', fontSize: 15, fontWeight: '800'},
  statusIconText: {color: '#fff', fontSize: 13, fontWeight: '800', fontStyle: 'italic'},
  statusText: {fontSize: 16, fontWeight: '700', color: '#1A1A1A', flex: 1},

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

  privacyNote: {fontSize: 12, color: '#8E8E93', lineHeight: 17, textAlign: 'center'},

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
