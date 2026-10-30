import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert} from 'react-native';
import {PrimaryButton} from '../components/PrimaryButton';
import {logger} from '../lib/logger';
import {useGarminDevices} from '../data/hooks/useGarminDevices';
import {useConfirmGarminPairing, useRemoveGarminDevice} from '../data/hooks/useGarminMutations';
import type {AppNavigationProp} from '../navigation/types';
import {makeStyles, useTheme} from '../theme';
import {useTabBarBottomPadding} from '../hooks/useTabBarBottomPadding';
import {formatPairingCodeInput, isPairingCodeComplete, SUPPORTED_GARMIN_DEVICES} from './Garmin/lib';

// Garmin Connect IQ bridge (docs/plans/garmin-connect-iq.md). Modeled on
// OuraIntegrationScreen.tsx, but there is no OAuth here: the bike computer
// shows a 6-digit code (packages/garmin-ciq PairView), the rider types it
// below, and the computer receives its own long-lived token a few seconds
// later. This screen also lists paired computers and revokes them.
export const GarminIntegrationScreen: React.FC<{navigation: AppNavigationProp}> = ({navigation}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const bottomPadding = useTabBarBottomPadding();
  const devicesQuery = useGarminDevices();
  const confirmPairing = useConfirmGarminPairing();
  const removeDevice = useRemoveGarminDevice();
  const [code, setCode] = useState('');

  useEffect(() => {
    if (devicesQuery.isError) {
      logger.error('[Garmin] Error loading devices:', devicesQuery.error);
    }
  }, [devicesQuery.isError, devicesQuery.error]);

  const handleConfirm = async () => {
    if (!isPairingCodeComplete(code)) {
      return;
    }
    try {
      const result = await confirmPairing.mutateAsync(code.replace(/\s/g, ''));
      setCode('');
      Alert.alert(
        t('garmin.pairedTitle'),
        t('garmin.pairedMessage', {device: result.device_name || t('garmin.genericDevice')}),
      );
    } catch (error) {
      logger.error('[Garmin] Pairing failed:', error);
      const status = (error as {status?: number})?.status;
      Alert.alert(t('common.error'), status === 404 ? t('garmin.codeNotFound') : t('garmin.pairFailed'));
    }
  };

  const handleRemove = (id: number, name: string | null) => {
    Alert.alert(t('garmin.removeConfirmTitle'), t('garmin.removeConfirmMessage', {device: name || t('garmin.genericDevice')}), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('garmin.removeButton'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeDevice.mutateAsync(id);
          } catch (error) {
            logger.error('[Garmin] Remove failed:', error);
            Alert.alert(t('common.error'), t('garmin.removeFailed'));
          }
        },
      },
    ]);
  };

  const devices = devicesQuery.data ?? [];
  const steps = [t('garmin.step1'), t('garmin.step2'), t('garmin.step3')];

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
          <Text style={styles.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('garmin.title')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, {paddingBottom: bottomPadding}]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.description}>{t('garmin.description')}</Text>

        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('garmin.pairTitle')}</Text>
            {steps.map((step, i) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={text => setCode(formatPairingCodeInput(text))}
              placeholder="000 000"
              placeholderTextColor={theme.colors.separator}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={7}
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
              testID="garmin-code-input"
            />
            <PrimaryButton
              title={t('garmin.pairButton')}
              onPress={handleConfirm}
              loading={confirmPairing.isPending}
              disabled={!isPairingCodeComplete(code)}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('garmin.devicesTitle')}</Text>
            {devicesQuery.isLoading ? (
              <ActivityIndicator color={theme.colors.text.primary} />
            ) : devices.length === 0 ? (
              <Text style={styles.emptyText}>{t('garmin.noDevices')}</Text>
            ) : (
              devices.map((d, i) => (
                <View key={d.id} style={[styles.deviceRow, i > 0 && styles.rowDivider]}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{d.device_name || t('garmin.genericDevice')}</Text>
                    <Text style={styles.deviceMeta}>
                      {d.last_seen_at
                        ? t('garmin.lastSeen', {date: new Date(d.last_seen_at).toLocaleDateString()})
                        : t('garmin.pairedOn', {date: new Date(d.paired_at).toLocaleDateString()})}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleRemove(d.id, d.device_name)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                    testID={`garmin-remove-${d.id}`}>
                    <Text style={styles.removeText}>{t('garmin.remove')}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          <Text style={styles.supported}>
            {t('garmin.supported', {devices: SUPPORTED_GARMIN_DEVICES.join(', ')})}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  root: {flex: 1, backgroundColor: theme.colors.backgroundLight},

  header: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  backArrow: {fontSize: 32, color: theme.colors.text.primary, lineHeight: 34, fontWeight: '300', marginBottom: 4},
  title: {fontSize: 32, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.8},

  scroll: {flex: 1},
  content: {padding: 20},
  description: {fontSize: 15, color: theme.colors.text.iosMuted, marginBottom: 20, lineHeight: 21},

  section: {gap: 16},

  card: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    padding: 20,
    ...theme.shadows.card,
  },
  cardTitle: {fontSize: 18, fontWeight: '800', color: theme.colors.text.primary, marginBottom: 14, letterSpacing: -0.3},

  stepRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10},
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accentSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumText: {fontSize: 12, fontWeight: '800', color: theme.colors.accent},
  stepText: {flex: 1, fontSize: 15, color: theme.colors.text.primary, lineHeight: 21},

  codeInput: {
    marginTop: 8,
    marginBottom: 14,
    backgroundColor: theme.colors.backgroundLight,
    borderRadius: theme.radii.lg,
    paddingVertical: 16,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    color: theme.colors.text.primary,
  },

  deviceRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12},
  rowDivider: {borderTopWidth: 1, borderTopColor: theme.colors.garage.divider},
  deviceInfo: {flex: 1, gap: 2},
  deviceName: {fontSize: 15, fontWeight: '700', color: theme.colors.text.primary},
  deviceMeta: {fontSize: 13, color: theme.colors.text.iosMuted},
  removeText: {fontSize: 14, fontWeight: '700', color: theme.colors.danger},
  emptyText: {fontSize: 14, color: theme.colors.text.iosMuted, lineHeight: 20},

  supported: {fontSize: 12, color: theme.colors.text.faint, textAlign: 'center', lineHeight: 18},
}));
