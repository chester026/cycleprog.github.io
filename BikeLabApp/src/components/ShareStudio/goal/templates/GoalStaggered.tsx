/**
 * 02 · Staggered — dark page with a navy glow, a ghosted "COMPLETED" behind
 * the title and four giant numbers stepping down in two columns (distance in
 * bright blue). Background: dark or your photo (dimmed).
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {GoalCanvas, DarkGlow, BrandLockup, TierPill, GoalTitle, PhotoLayer, recapStatValue, PAD, W, H, type RecapStatKey} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;

// [column, top of the cell's rule] — the stagger, straight from the design.
const CELLS: Array<{key: RecapStatKey; labelKey: string; col: 0 | 1; top: number; blue?: boolean}> = [
  {key: 'elevation', labelKey: 'goalShare.label.elevationM', col: 1, top: 648},
  {key: 'distance', labelKey: 'goalShare.label.distanceKm', col: 0, top: 919, blue: true},
  {key: 'hours', labelKey: 'goalShare.label.saddleH', col: 1, top: 1191},
  {key: 'rides', labelKey: 'goalShare.label.rides', col: 0, top: 1462},
];

export const GoalStaggered: React.FC<GoalTemplateProps> = ({
  goalTitle,
  tier,
  recap,
  dates,
  backgroundType,
  backgroundImage,
  isGrayscale,
}) => {
  const {t} = useTranslation();
  const hasPhoto = backgroundType === 'photo' && !!backgroundImage;

  return (
    <GoalCanvas backgroundColor={g.darkBg}>
      {hasPhoto ? (
        <>
          <PhotoLayer uri={backgroundImage} isGrayscale={isGrayscale} />
          <View style={styles.dim} />
        </>
      ) : (
        <DarkGlow />
      )}

      <BrandLockup tone="onDark" style={styles.lockup} />
      <TierPill tier={tier} style={styles.tier} />

      <Text style={styles.date}>
        {dates.completedNumeric} · {t('goalShare.goalCompleted')}
      </Text>
      <View style={styles.head}>
        <GoalTitle title={goalTitle} lines={2} width={936} fontSize={130} lineHeight={140} letterSpacing={-2} style={styles.title} />
        <Text style={styles.tagline} numberOfLines={2}>
          {t('goalShare.tagline.everyAlarm')}
        </Text>
      </View>

      {CELLS.map(({key, labelKey, col, top, blue}) => (
        <View key={key} style={[styles.cell, col === 0 ? styles.colLeft : styles.colRight, {top}]}>
          <Text style={styles.label}>{t(labelKey)}</Text>
          <Text style={[styles.value, blue && styles.valueBlue]} numberOfLines={1} adjustsFontSizeToFit>
            {recapStatValue(recap, key)}
          </Text>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{dates.range}</Text>
        <Text style={styles.footerText}>{t('goalShare.daysCount', {count: recap.days})}</Text>
      </View>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  dim: {position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: g.photoDim},
  lockup: {position: 'absolute', left: PAD, top: 80},
  tier: {position: 'absolute', right: PAD, top: 103},
  date: {position: 'absolute', left: PAD, top: 240, fontSize: 32, fontWeight: '600', color: g.labelOnDark},

  head: {position: 'absolute', left: PAD, right: PAD, top: 300},
  title: {fontWeight: '700', color: theme.colors.text.inverse},
  tagline: {marginTop: 16, fontSize: 34, fontWeight: '600', lineHeight: 44, color: g.labelOnDark, display: 'none'},
  cell: {position: 'absolute', borderTopWidth: 2, borderTopColor: g.ruleOnDark, paddingTop: 16},
  colLeft: {left: PAD, width: 500},
  colRight: {left: 498, width: 510},
  label: {fontSize: 38, fontWeight: '600', color: g.labelOnDark},
  value: {fontSize: 180, lineHeight: 210, fontWeight: '800', letterSpacing: -2, color: theme.colors.text.inverse},
  valueBlue: {color: g.brightBlue},
  footer: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    top: 1792,
    borderTopWidth: 2,
    borderTopColor: g.ruleOnDark,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {fontSize: 28, color: g.labelOnDark},
}));
