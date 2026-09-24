/**
 * 07 · Duotone photo — your photo mapped to a blue duotone on a black page,
 * with a solid blue card at the bottom: tier + days, the title, and a 2x2
 * numbers grid.
 *
 * Owner redesign: the old card knocked the last title word out in a white
 * box (which left a stray white block when the title wrapped), added a
 * serif-italic tagline and squeezed four numbers into one row — too much in
 * one box and hard to read. Now it's one type family, plain white title,
 * and four evenly spaced numbers with readable labels.
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import LinearGradient from 'react-native-linear-gradient';
import {GoalCanvas, BrandLockup, TierPill, PhotoLayer, GoalTitle, recapStatValue, PAD, W} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;
const CARD_PAD = 72;
const CARD_INNER_W = W - 2 * PAD - 2 * CARD_PAD;

export const GoalDuotone: React.FC<GoalTemplateProps> = ({goalTitle, tier, recap, dates, backgroundImage}) => {
  const {t} = useTranslation();

  const stats = [
    {key: 'distance' as const, unit: t('common.km')},
    {key: 'elevation' as const, unit: t('goalShare.unit.mUp')},
    {key: 'rides' as const, unit: t('goalShare.ridesUnit', {count: recap.rides})},
    {key: 'hours' as const, unit: t('goalShare.hoursUnit', {count: Math.round(recap.movingHours)})},
  ];

  return (
    <GoalCanvas backgroundColor={g.darkBg}>
      <PhotoLayer uri={backgroundImage} duotone />
      <LinearGradient colors={[...g.duotoneScrim]} style={styles.scrim} />

      <BrandLockup tone="onDark" style={styles.lockup} />
      <Text style={styles.date}>{dates.rangeShort}</Text>

      <View style={styles.card}>
        <View style={styles.meta}>
          <TierPill tier={tier} />
          <Text style={styles.metaText}>
            {t('goalShare.goalCompleteDays', {days: t('goalShare.daysCount', {count: recap.days})})}
          </Text>
        </View>

        <GoalTitle
          title={goalTitle}
          lines={3}
          width={CARD_INNER_W}
          fontSize={112}
          lineHeight={120}
          letterSpacing={-4}
          style={styles.title}
        />

        <View style={styles.grid}>
          {stats.map(({key, unit}) => (
            <View key={key} style={styles.cell}>
              <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
                {recapStatValue(recap, key)}
              </Text>
              <Text style={styles.unit} numberOfLines={1}>
                {unit}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  scrim: {position: 'absolute', left: 0, bottom: 0, width: W, height: 1100},
  lockup: {position: 'absolute', left: PAD, top: 80},
  date: {position: 'absolute', right: PAD, top: 111, fontSize: 30, fontWeight: '500', color: theme.colors.text.inverse},
  card: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    bottom: 120,
    backgroundColor: theme.colors.accent,
    // Taller card (owner): more vertical air than the side padding.
    paddingHorizontal: CARD_PAD,
    borderRadius: 52,
    paddingTop: 104,
    paddingBottom: 112,
  },
  meta: {flexDirection: 'row', alignItems: 'center', gap: 20},
  metaText: {fontSize: 32, fontWeight: '500', color: g.onAccentMuted},
  title: {marginTop: 76, fontWeight: '800', color: theme.colors.text.inverse},
  grid: {
    marginTop: 100,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 64,
  },
  cell: {
    width: CARD_INNER_W / 2,
    paddingRight: 24,
    paddingTop: 36,
    borderTopWidth: 2,
    borderTopColor: g.ruleOnAccent,
  },
  value: {fontSize: 104, lineHeight: 112, fontWeight: '800', letterSpacing: -4, color: theme.colors.text.inverse},
  unit: {marginTop: 8, fontSize: 32, fontWeight: '500', color: g.onAccentMuted},
}));
