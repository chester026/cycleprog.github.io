import React from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, ActivityIndicator, Alert} from 'react-native';
import {PrimaryButton} from '../../components/PrimaryButton';
import {useGarminConnectStatus} from '../../data/hooks/useGarminConnectStatus';
import {useGarminConnectSync} from '../../data/hooks/useGarminMutations';
import {logger} from '../../lib/logger';
import {makeStyles, useTheme} from '../../theme';
import {formatGarminDate, formatGarminDay, garminHealthRows} from './lib';

// Garmin Connect as a data source (docs/plans/garmin-connect-api.md §6) —
// the top card of GarminIntegrationScreen. The other cards on that screen
// pair an Edge so it can SHOW BikeLab; this one is about the rider's Garmin
// rides and health data coming INTO BikeLab.
//
// Two states, both driven by GET /api/garmin/connect/status:
//   connected     — ride count, latest ride, health days, last sync, and
//                   the newest health day's figures (only the ones the watch
//                   measured). Today that is the owner's account, linked
//                   server-side with a developer key (`transport: 'personal'`).
//   not connected — the connect button. It stays disabled in this version:
//                   riders link through Garmin's OAuth, which is not built
//                   yet. The server's `available` flag is what will say the
//                   flow exists; the handler lands here together with it.
export const GarminConnectCard: React.FC = () => {
  const {t} = useTranslation();
  const theme = useTheme();
  const statusQuery = useGarminConnectStatus();
  const sync = useGarminConnectSync();
  const status = statusQuery.data;
  const connected = !!status?.connected;

  // Same fetch as the coach chat's "Get Garmin health data" chip. Only a
  // developer-key connection can be refreshed on demand; a Developer Program
  // one has its data pushed by Garmin, so there is nothing to press.
  const handleRefresh = () => {
    sync.mutate(undefined, {
      onError: error => {
        logger.error('[Garmin] Health refresh failed:', error);
        Alert.alert(t('common.error'), t('garmin.refreshFailed'));
      },
    });
  };

  const rows = status
    ? [
        {label: t('garmin.connectRides'), value: String(status.activities)},
        {label: t('garmin.connectLatestRide'), value: formatGarminDate(status.last_activity_at)},
        {label: t('garmin.connectHealthDays'), value: String(status.health_days)},
        {label: t('garmin.connectLastSync'), value: formatGarminDate(status.last_sync_at)},
      ]
    : [];
  const healthRows = garminHealthRows(status?.health_latest, t);

  return (
    <View style={styles.card} testID="garmin-connect-card">
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>{t('garmin.connectTitle')}</Text>
        {status ? (
          <View style={[styles.pill, connected ? styles.pillOn : styles.pillOff]} testID="garmin-connect-pill">
            <Text style={[styles.pillText, connected ? styles.pillTextOn : styles.pillTextOff]}>
              {connected ? t('garmin.connectStatusOn') : t('garmin.connectStatusOff')}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.description}>{t('garmin.connectDescription')}</Text>

      {statusQuery.isLoading ? (
        <ActivityIndicator color={theme.colors.text.primary} style={styles.loader} />
      ) : !status ? (
        <Text style={styles.note}>{t('garmin.connectLoadFailed')}</Text>
      ) : connected ? (
        <>
          <View style={styles.rows}>
            {rows.map((row, i) => (
              <View key={row.label} style={[styles.row, i > 0 && styles.rowDivider]}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
          </View>
          {healthRows.length > 0 ? (
            <View style={styles.health} testID="garmin-health-latest">
              <Text style={styles.healthTitle}>
                {t('garmin.healthTitle', {date: formatGarminDay(status.health_latest?.day)})}
              </Text>
              {healthRows.map((row, i) => (
                <View key={row.label} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {status.transport === 'personal' ? (
            <>
              <PrimaryButton
                title={t('garmin.refreshHealth')}
                onPress={handleRefresh}
                loading={sync.isPending}
                variant="secondary"
                style={styles.refresh}
              />
              <Text style={styles.note}>{t('garmin.connectPersonalNote')}</Text>
            </>
          ) : null}
        </>
      ) : (
        <>
          <PrimaryButton title={t('garmin.connectButton')} onPress={() => {}} disabled={true} />
          <Text style={[styles.note, styles.noteCentered]}>{t('garmin.connectSoon')}</Text>
        </>
      )}
    </View>
  );
};

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: 20,
    ...theme.shadows.card,
  },
  headRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8},
  cardTitle: {flexShrink: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.3},

  pill: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  pillOn: {backgroundColor: theme.colors.strava.statusOkBg},
  pillOff: {backgroundColor: theme.colors.backgroundLight},
  pillText: {fontSize: 12, fontWeight: '700'},
  pillTextOn: {color: theme.colors.text.inverse},
  pillTextOff: {color: theme.colors.text.iosMuted},

  description: {fontSize: 14, color: theme.colors.text.iosMuted, lineHeight: 20, marginBottom: 14},
  loader: {paddingVertical: 12},

  rows: {marginBottom: 2},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12},
  rowDivider: {borderTopWidth: 1, borderTopColor: theme.colors.garage.divider},
  rowLabel: {fontSize: 14, fontWeight: '500', color: theme.colors.text.primary},
  rowValue: {fontSize: 14, fontWeight: '700', color: theme.colors.text.iosMuted},

  health: {marginTop: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.garage.divider},
  healthTitle: {fontSize: 13, fontWeight: '800', color: theme.colors.text.iosMuted, letterSpacing: 0.2, marginBottom: 2},

  refresh: {marginTop: 14},

  note: {fontSize: 12, color: theme.colors.text.faint, lineHeight: 18, marginTop: 10},
  noteCentered: {textAlign: 'center'},
}));
