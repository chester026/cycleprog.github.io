// "Your garage on the Edge" — the entry point to the Garmin Connect IQ
// bridge (docs/plans/garmin-connect-iq.md), on the Garage home right under
// the last-ride hero. Light card like the rest of the garage so the brand
// blue CTA and the dark bike-computer bezel both read against it (owner,
// 30.10.2026: the dark version swallowed the CTA and the illustration).
// Hidden once at least one bike computer is paired.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles} from '../../theme';
import {useGarminDevices} from '../../data/hooks/useGarminDevices';

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
        <Text style={styles.subtitle} numberOfLines={2}>
          {t('garmin.bannerSubtitle')}
        </Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{t('garmin.bannerCta')}</Text>
        </View>
      </View>

      {/* Stylised Edge: dark bezel on the light card, screen with the brand
          mark, two text lines and three wear bars — the device's Garage
          page in miniature. */}
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
    alignItems: 'center',
    marginHorizontal: theme.spacing[16],
    marginTop: theme.spacing[24],
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radii.lg,
    paddingLeft: theme.spacing[20],
    paddingRight: theme.spacing[16],
    paddingVertical: theme.spacing[20],
    ...theme.shadows.card,
  },
  textCol: {flex: 1, paddingRight: theme.spacing[16]},
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.text.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing[6],
  },
  title: {fontSize: theme.typography.fontSize.xl, fontWeight: '800', color: theme.colors.text.primary, letterSpacing: -0.3},
  subtitle: {fontSize: 13, color: theme.colors.text.secondary, lineHeight: 19, marginTop: theme.spacing[6]},
  cta: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[14],
    paddingVertical: 8,
    paddingHorizontal: theme.spacing[14],
    borderRadius: 100,
    backgroundColor: theme.colors.accent,
  },
  ctaText: {fontSize: 13, fontWeight: '800', color: theme.colors.text.inverse},

  device: {
    width: 64,
    height: 104,
    borderRadius: 12,
    backgroundColor: theme.colors.text.muted,
    padding: 5,
    justifyContent: 'center',
  },
  deviceScreen: {
    flex: 1,
    borderRadius: 7,
    backgroundColor: theme.colors.backgroundLight,
    padding: 7,
    gap: 4,
    justifyContent: 'center',
  },
  screenMark: {width: 9, height: 12, borderRadius: 2, backgroundColor: theme.colors.accent, marginBottom: 2},
  screenLineWide: {height: 4, width: '80%', borderRadius: 2, backgroundColor: theme.colors.text.primary},
  screenLine: {height: 3, width: '50%', borderRadius: 2, backgroundColor: theme.colors.disabled, marginBottom: 2},
  screenBarTrack: {height: 3, borderRadius: 2, backgroundColor: theme.colors.disabled, overflow: 'hidden'},
  screenBarFill: {height: 3, width: '70%', borderRadius: 2, backgroundColor: theme.colors.accent},
  screenBarFillShort: {width: '25%', backgroundColor: theme.colors.danger},
  screenBarFillMid: {width: '45%', backgroundColor: theme.colors.warning},
}));
