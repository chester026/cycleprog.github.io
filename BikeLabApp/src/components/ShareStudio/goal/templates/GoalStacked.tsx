/**
 * 03 · Stacked — the blue page. Title top-left, then four ledger rows whose
 * numbers fill the width, alternating white and ink, units tucked in at the
 * baseline. Signed off with the inverse lockup and the Everest ratio.
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import LinearGradient from 'react-native-linear-gradient';
import {GoalCanvas, BrandLockup, TierPill, GoalTitle, recapStatValue, W, H} from './parts';
import {formatMultiplier} from '../recap';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;
const PAD3 = 64;
const ROW_TOP = 636;
const ROW_H = 250;

export const GoalStacked: React.FC<GoalTemplateProps> = ({goalTitle, tier, recap}) => {
  const {t} = useTranslation();
  const white = styles.onWhite;
  const ink = styles.onInk;

  const rows: Array<{label: React.ReactNode; value: React.ReactNode}> = [
    {
      label: <Text style={[styles.label, white]}>{t('goalShare.label.distanceRidden')}</Text>,
      value: (
        <Text style={[styles.value, white]}>
          {recapStatValue(recap, 'distance')}
          <Text style={styles.unit}>{t('common.km')}</Text>
        </Text>
      ),
    },
    {
      label: <Text style={[styles.label, ink]}>{t('goalShare.label.metresClimbing')}</Text>,
      value: (
        <Text style={[styles.value, ink]}>
          {recapStatValue(recap, 'elevation')}
          <Text style={styles.unit}>{t('common.m')}</Text>
        </Text>
      ),
    },
    {
      label: (
        <Text style={styles.label}>
          <Text style={white}>{t('goalShare.label.ridesPart')}</Text>
          <Text style={ink}> {t('goalShare.label.hoursPart')}</Text>
        </Text>
      ),
      value: (
        <Text style={styles.value}>
          <Text style={white}>{recapStatValue(recap, 'rides')} </Text>
          <Text style={ink}>
            {recapStatValue(recap, 'hours')}
            <Text style={styles.unit}>{t('common.h')}</Text>
          </Text>
        </Text>
      ),
    },
    {
      label: <Text style={[styles.label, ink]}>{t('goalShare.label.longestSingle')}</Text>,
      value: (
        <Text style={[styles.value, ink]}>
          {recapStatValue(recap, 'longest')}
          <Text style={styles.unit}>{t('common.km')}</Text>
        </Text>
      ),
    },
  ];

  return (
    <GoalCanvas backgroundColor={colors.accent}>
      <LinearGradient
        colors={[...g.stackedGradient]}
        locations={[0, 0.6, 1]}
        start={{x: 0, y: 1}}
        end={{x: 1, y: 0}}
        style={styles.fill}
      />

      <GoalTitle title={goalTitle} lines={2} width={850} fontSize={140} lineHeight={150} letterSpacing={-2} style={styles.title} />
      <TierPill tier={tier} inverse style={styles.tier} />
      <Text style={styles.tagline} numberOfLines={2}>
        {t('goalShare.tagline.stacked', {days: t('goalShare.daysCount', {count: recap.days})})}
      </Text>

      {rows.map((row, i) => (
        <View key={i} style={[styles.row, {top: ROW_TOP + i * ROW_H}]}>
          <View style={styles.labelCol}>{row.label}</View>
          {/* Spans the whole row, not a column beside the label: like the
              design, a wide number runs in under the (top-left) label
              instead of being squeezed. Only a 5+ digit value shrinks. */}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.valueWrap}>
            {row.value}
          </Text>
        </View>
      ))}
      <View style={styles.lastRule} />

      <BrandLockup tone="inverse" style={styles.lockup} />
      <Text style={styles.everest}>{t('goalShare.everest', {times: formatMultiplier(recap.everests)})}</Text>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  fill: {position: 'absolute', left: 0, top: 0, width: W, height: H},
  title: {
    position: 'absolute',
    left: PAD3,
    top: 180,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  tier: {position: 'absolute', left: PAD3, top: 90},
  tagline: {position: 'absolute', left: PAD3, right: PAD3, top: 460, fontSize: 34, color: 'rgba(255, 255, 255, 0.82)'},
  row: {
    position: 'absolute',
    left: PAD3,
    right: PAD3,
    height: ROW_H,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    flexDirection: 'row',
  },
  labelCol: {width: 250, paddingTop: 22},
  label: {fontSize: 32, lineHeight: 40, fontWeight: '600', marginTop:12},
  onWhite: {color: theme.colors.text.inverse},
  onInk: {color: theme.colors.text.inverse},
  // Absolutely placed so its baseline sits on the next row's rule (the
  // line box is 300 tall, ~64 of it below the baseline), like the design.
  valueWrap: {position: 'absolute', left: 0, right: 0, bottom: -24, textAlign: 'right'},
  value: {fontSize: 200, lineHeight: 300, fontWeight: '700', letterSpacing: -8},
  unit: {fontSize: 100, letterSpacing: -2},
  lastRule: {
    position: 'absolute',
    left: 254,
    right: PAD3,
    top: ROW_TOP + 4 * ROW_H,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  lockup: {position: 'absolute', left: PAD3, top: 1786},
  everest: {position: 'absolute', right: PAD3, top: 1798, fontSize: 28, fontWeight: '600', color: 'rgba(255, 255, 255, 0.75)'},
}));
