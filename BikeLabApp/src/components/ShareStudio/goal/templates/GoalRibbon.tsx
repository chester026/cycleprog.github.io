/**
 * 08 · Ribbon — dark page, a letter-spaced blue label ("GOAL · 73 DAYS ·
 * EPIC GOAL"), the title, a serif-italic "& worth every km." and a
 * bracket-numbered ledger. Background: dark or your photo.
 *
 * The design's diagonal corner ribbon and "COMPLETED" label were merged at
 * the owner's request: the ribbon's text now sits in the label's place.
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {TIER_CONFIG} from '@bikelab/shared/constants';
import {GoalCanvas, BrandLockup, GoalTitle, PhotoLayer, LongArrow, recapStatValue, isHighTier, SERIF_FONT, PAD, W, H, type RecapStatKey} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;
const LEDGER_TOP = 872;
/** 0 -> "[01]" */
const ledgerIndex = (i: number) => `[${String(i + 1).padStart(2, '0')}]`;
const ROW_H = 158;

const ROWS: Array<{key: RecapStatKey; labelKey: string; unitKey?: string}> = [
  {key: 'rides', labelKey: 'goalShare.ledger.rides'},
  {key: 'distance', labelKey: 'goalShare.ledger.distance', unitKey: 'common.km'},
  {key: 'elevation', labelKey: 'goalShare.ledger.climbed', unitKey: 'common.m'},
  {key: 'hours', labelKey: 'goalShare.ledger.saddle', unitKey: 'common.h'},
  {key: 'longest', labelKey: 'goalShare.ledger.longest', unitKey: 'common.km'},
  
];

export const GoalRibbon: React.FC<GoalTemplateProps> = ({
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

  const goalWord = t('goalShare.ribbonGoal');
  const days = t('goalShare.daysCount', {count: recap.days});
  const segments = [goalWord, days];
  if (isHighTier(tier)) segments.push(`${t(TIER_CONFIG[tier].key)} ${goalWord}`);
  const ribbon = segments.join(' · ');

  return (
    <GoalCanvas backgroundColor={g.darkBg}>
      {hasPhoto ? (
        <>
          <PhotoLayer uri={backgroundImage} isGrayscale={isGrayscale} />
          <View style={styles.dim} />
        </>
      ) : null}

      <BrandLockup tone="onDark" style={styles.lockup} />

      <View style={styles.ribbonLabel}>
        <Text style={styles.ribbonLabelText} numberOfLines={1} adjustsFontSizeToFit>
          {ribbon}
        </Text>
      </View>
      <GoalTitle
        title={goalTitle}
        lines={2}
        width={900}
        fontSize={148}
        lineHeight={145}
        letterSpacing={-2}
        style={styles.title}
      />
      <Text style={styles.tagline}>{t('goalShare.finish.line1')}</Text>

      {ROWS.map(({key, labelKey, unitKey}, i) => (
        <View key={key} style={[styles.row, {top: LEDGER_TOP + i * ROW_H}]}>
          <Text style={styles.index}>{ledgerIndex(i)}</Text>
          <Text style={styles.label} numberOfLines={1}>
            {t(labelKey)}
          </Text>
          <Text style={styles.value} numberOfLines={1}>
            {recapStatValue(recap, key)}
            {unitKey ? <Text style={styles.unit}> {t(unitKey)}</Text> : null}
          </Text>
        </View>
      ))}

      <Text style={styles.date}>{dates.range}</Text>
      <LongArrow width={164} style={styles.arrow} />
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  // Same dark wash as Staggered — without it the white ledger text sits
  // straight on the photo and disappears into bright areas.
  dim: {position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundColor: g.photoDim},
  lockup: {position: 'absolute', left: PAD, top: 80},
  ribbonLabel: {
    position: 'absolute',
    left: PAD,
    top: 290,
    maxWidth: W - 2 * PAD,
    height: 56,
    paddingHorizontal: 26,
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  ribbonLabelText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 8,
    textTransform: 'uppercase',
    color: theme.colors.text.inverse,
  },
  title: {
    position: 'absolute',
    left: PAD,
    top: 400,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  tagline: {
    position: 'absolute',
    left: PAD,
    top: 670,
    fontFamily: SERIF_FONT,
    fontStyle: 'italic',
    fontSize: 52,
    color: g.lavender,
  },
  row: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    height: ROW_H,
    borderTopWidth: 2,
    borderTopColor: g.ruleOnDark,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 0,
  },
  index: {width: 96, fontSize: 32, fontWeight: '800', color: g.brightBlue, marginBottom: 32},
  label: {flex: 1, fontSize: 40, fontWeight: '600', color: theme.colors.text.inverse, marginBottom: 28},
  value: {fontSize: 129, lineHeight: 136, fontWeight: '700', letterSpacing: -5, color: theme.colors.text.inverse},
  unit: {fontSize: 39, fontWeight: '600', letterSpacing: 0, color: g.labelOnDark},
  date: {position: 'absolute', left: PAD, top: 1812, fontSize: 26, color: g.labelOnDark},
  arrow: {position: 'absolute', right: 64, top: 1810},
}));
