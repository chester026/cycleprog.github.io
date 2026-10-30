// "See this on your Edge" banner — the entry point to the Garmin Connect IQ
// bridge (docs/plans/garmin-connect-iq.md). Shown on the garage until at
// least one bike computer is paired; the illustration is a stylised Edge
// drawn from Views (no asset), the screen shows the same three stats the
// device's Garage page does.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, withOpacity} from '../../theme';
import {useGarminDevices} from '../../data/hooks/useGarminDevices';
import {SUPPORTED_GARMIN_DEVICES} from '../Garmin/lib';

interface GarminBannerProps {
  onPress: () => void;
}

export const GarminBanner: React.FC<GarminBannerProps> = ({onPress}) => {
  const {t} = useTranslation();
  const devicesQuery = useGarminDevices();
  if ((devicesQuery.data?.length ?? 0) > 0) {
    return null;
  }
  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.85} testID="garmin-banner">
      <View style={styles.textCol}>
        <Text style={styles.eyebrow}>{t('garmin.bannerEyebrow')}</Text>
        <Text style={styles.title}>{t('garmin.bannerTitle')}</Text>
        <Text style={styles.subtitle}>{t('garmin.bannerSubtitle')}</Text>
        <View style={styles.ctaRow}>
          <Text style={styles.cta}>{t('garmin.bannerCta')}</Text>
          <Text style={styles.ctaArrow}>{'→'}</Text>
        </View>
        <Text style={styles.supported}>{SUPPORTED_GARMIN_DEVICES.join(' · ')}</Text>
      </View>

      <View style={styles.device} accessible={false}>
        <View style={styles.deviceScreen}>
          <View style={styles.screenMark} />
          <View style={styles.screenLineWide} />
          <View style={styles.screenLine} />
          <View style={styles.screenBarTrack}>
            <View style={styles.screenBarFill} />
          </View>
          <View style={styles.screenBarTrack}>
            <View style={[styles.screenBarFill, styles.screenBarFillShort]} />
          </View>
          <View style={styles.screenBarTrack}>
            <View style={[styles.screenBarFill, styles.screenBarFillMid]} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: theme.colors.text.primary,
    borderRadius: theme.radii.lg,
    paddingLeft: theme.spacing[20],
    paddingVertical: theme.spacing[16],
    marginBottom: theme.spacing[24],
    overflow: 'hidden',
  },
  textCol: {flex: 1, paddingRight: theme.spacing[12]},
  eyebrow: {
    fontSize: 10,
    fontWeight: '600',
    color: withOpacity(theme.colors.text.inverse, 0.5),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing[4],
  },
  title: {fontSize: theme.typography.fontSize.xl, fontWeight: '800', color: theme.colors.text.inverse, letterSpacing: -0.4},
  subtitle: {fontSize: 13, color: withOpacity(theme.colors.text.inverse, 0.7), lineHeight: 18, marginTop: 4},
  ctaRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10},
  cta: {fontSize: 14, fontWeight: '800', color: theme.colors.accent},
  ctaArrow: {fontSize: 14, fontWeight: '800', color: theme.colors.accent},
  supported: {fontSize: 10, color: withOpacity(theme.colors.text.inverse, 0.4), marginTop: 10},

  // Stylised Edge: dark bezel, light screen with mark, two text lines and
  // three wear bars — the device's own Garage page in miniature.
  device: {
    width: 74,
    marginRight: -6,
    marginVertical: -6,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.12),
    padding: 6,
    paddingRight: 0,
    justifyContent: 'center',
  },
  deviceScreen: {
    flex: 1,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    backgroundColor: theme.colors.backgroundLight,
    padding: 8,
    gap: 5,
    justifyContent: 'center',
  },
  screenMark: {width: 10, height: 14, borderRadius: 2, backgroundColor: theme.colors.accent, marginBottom: 2},
  screenLineWide: {height: 4, width: '80%', borderRadius: 2, backgroundColor: theme.colors.text.primary},
  screenLine: {height: 3, width: '50%', borderRadius: 2, backgroundColor: theme.colors.disabled, marginBottom: 3},
  screenBarTrack: {height: 3, borderRadius: 2, backgroundColor: theme.colors.disabled, overflow: 'hidden'},
  screenBarFill: {height: 3, width: '70%', borderRadius: 2, backgroundColor: theme.colors.accent},
  screenBarFillShort: {width: '25%', backgroundColor: theme.colors.danger},
  screenBarFillMid: {width: '45%', backgroundColor: theme.colors.warning},
}));
