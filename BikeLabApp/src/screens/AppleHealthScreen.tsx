import React, {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform} from 'react-native';
import {useHealthData} from '../hooks/useHealthData';

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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('appleHealth.title')}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>{t('appleHealth.description')}</Text>

        {Platform.OS !== 'ios' ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusIcon}>ℹ️</Text>
            <Text style={styles.statusText}>{t('appleHealth.iosOnly')}</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator size="large" color="#000" style={{marginTop: 24}} />
        ) : isConnected ? (
          <View style={styles.connectedContainer}>
            <View style={styles.statusCard}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>{t('appleHealth.connected')}</Text>
            </View>

            <View style={styles.profileCard}>
              {metricRows.map(row => (
                <View key={row.label} style={styles.metricRow}>
                  <Text style={styles.metricLabel}>{row.label}</Text>
                  <Text style={styles.metricValue}>{row.value ?? t('appleHealth.noDataYet')}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.privacyNote}>{t('appleHealth.privacyNote')}</Text>

            <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.refreshButtonText}>{t('appleHealth.refresh')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.unlinkButton} onPress={handleDisconnect}>
              <Text style={styles.unlinkButtonText}>{t('appleHealth.disconnect')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.disconnectedContainer}>
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>{t('appleHealth.benefits')}</Text>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🔋</Text>
                <Text style={styles.benefitText}>{t('appleHealth.benefitRecovery')}</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>😴</Text>
                <Text style={styles.benefitText}>{t('appleHealth.benefitSleep')}</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🎯</Text>
                <Text style={styles.benefitText}>{t('appleHealth.benefitReadiness')}</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.benefitIcon}>🔒</Text>
                <Text style={styles.benefitText}>{t('appleHealth.benefitPrivacy')}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.linkButton} onPress={handleConnect} disabled={connecting}>
              {connecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.linkButtonText}>{t('appleHealth.connect')}</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.privacyNote}>{t('appleHealth.privacyNote')}</Text>
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
    flex: 1,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  metricLabel: {
    fontSize: 15,
    color: '#000',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8e8e93',
  },
  privacyNote: {
    fontSize: 13,
    color: '#8e8e93',
    lineHeight: 18,
    textAlign: 'center',
  },
  refreshButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  refreshButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '600',
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
    flex: 1,
  },
  linkButton: {
    backgroundColor: '#000',
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
