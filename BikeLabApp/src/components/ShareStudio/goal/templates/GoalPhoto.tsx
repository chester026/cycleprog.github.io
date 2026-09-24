/**
 * 04 · Photo — your ride photo full-bleed, the title and a four-number
 * stats card at the bottom over a scrim.
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import LinearGradient from 'react-native-linear-gradient';
import {GoalCanvas, BrandLockup, TierPill, CompletedPill, GoalTitle, PhotoLayer, recapStatValue, PAD, W, type RecapStatKey} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;

const STATS: Array<{key: RecapStatKey; labelKey: string}> = [
  {key: 'distance', labelKey: 'goalShare.label.distanceKm'},
  {key: 'elevation', labelKey: 'goalShare.label.elevationM'},
  {key: 'rides', labelKey: 'goalShare.label.rides'},
  {key: 'hours', labelKey: 'goalShare.label.hours'},
  
  
  
];

export const GoalPhoto: React.FC<GoalTemplateProps> = ({goalTitle, tier, recap, dates, backgroundImage, isGrayscale}) => {
  const {t} = useTranslation();
  return (
    <GoalCanvas backgroundColor={g.photoPlaceholder}>
      <PhotoLayer uri={backgroundImage} isGrayscale={isGrayscale} />
      <LinearGradient colors={[...g.photoScrimTop]} style={styles.scrimTop} />
      <LinearGradient colors={[...g.photoScrimBottom]} style={styles.scrimBottom} />

      <BrandLockup tone="onDark" style={styles.lockup} />
      <Text style={styles.date}>{dates.rangeShort}</Text>

      <View style={styles.bottom}>
        <View style={styles.pills}>
          <TierPill tier={tier} />
          <CompletedPill dark />
        </View>
        <GoalTitle title={goalTitle} lines={2} width={936} fontSize={153} lineHeight={150} letterSpacing={-2} style={styles.title} />
        <Text style={styles.tagline} numberOfLines={2}>
          {t('goalShare.tagline.everyAlarm')}
        </Text>
        <View style={styles.card}>
          {STATS.map(({key, labelKey}) => (
            <View key={key} style={styles.stat}>
              <Text style={styles.label} numberOfLines={1}>
                {t(labelKey)}
              </Text>
              <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
                {recapStatValue(recap, key)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  scrimTop: {position: 'absolute', left: 0, top: 0, width: W, height: 420},
  scrimBottom: {position: 'absolute', left: 0, bottom: 0, width: W, height: 1100},
  lockup: {position: 'absolute', left: PAD, top: 80},
  date: {position: 'absolute', right: PAD, top: 111, fontSize: 28, color: theme.colors.text.inverse},
  bottom: {position: 'absolute', left: PAD, right: PAD, bottom: 120},
  pills: {flexDirection: 'row', gap: 12},
  title: {
    marginTop: 64,
    fontWeight: '800',
    color: theme.colors.text.inverse,
  },
  tagline: {marginTop: 12, fontSize: 34, lineHeight: 44, color: 'rgba(255, 255, 255, 0.72)'},
  card: {
    marginTop: 96,
    height: 196,
    borderRadius: 36,
    backgroundColor: g.statsCard,
    paddingHorizontal: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:'space-between',
  },
  stat: {justifyContent:'space-between', flexDirection: 'column', paddingRight: 12},
  label: {justifyContent:'space-between', flexDirection: 'column',fontSize: 26, color: g.labelOnDark},
  value: {fontSize: 84, fontWeight: '800', letterSpacing: -3, color: theme.colors.text.inverse},
}));
