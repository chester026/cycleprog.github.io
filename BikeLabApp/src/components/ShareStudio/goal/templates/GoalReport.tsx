/**
 * 01 · Report — light page with the Goals-section wash. Pills and the
 * goal's title up top, then a 2x2 of big numbers centred in the space the
 * title leaves (owner redesign: the single tall column of four numbers
 * and the Everest card are gone). Same grid language as Inset / Finish
 * line minus the divider: distance leads in accent blue.
 * Header = lockup + tier pill, footer = date range + day count — the same
 * header/footer pair as Staggered, in light-page colours.
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {GoalCanvas, PastelWash, BrandLockup, TierPill, CompletedPill, GoalTitle, recapStatValue, PAD, W, type RecapStatKey} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;
const CONTENT_W = W - 2 * PAD;
// Title block: top 380 (owner: lower), pills + up to three 140px lines ends ≈ 880.
const HEAD_TOP = 380;
const GRID_TOP = 900;
// Leaves room for the footer (rule at 1792).
const GRID_BOTTOM = 200;

const GRID: Array<{key: RecapStatKey; labelKey: string; accent?: boolean}> = [
  {key: 'distance', labelKey: 'goalShare.label.distanceKm', accent: true},
  {key: 'elevation', labelKey: 'goalShare.label.climbedM'},
  {key: 'rides', labelKey: 'goalShare.label.rides'},
  {key: 'hours', labelKey: 'goalShare.label.saddleH'},
];

export const GoalReport: React.FC<GoalTemplateProps> = ({goalTitle, tier, recap, dates}) => {
  const {t} = useTranslation();
  return (
    <GoalCanvas backgroundColor={g.lightBg}>
      <PastelWash />
      <BrandLockup tone="onLight" style={styles.lockup} />
      <TierPill tier={tier} style={styles.tier} />

      <View style={styles.head}>
        <View style={styles.pills}>
          <CompletedPill />
        </View>
        <GoalTitle title={goalTitle} lines={3} width={CONTENT_W} fontSize={130} lineHeight={140} letterSpacing={-2} style={styles.title} />
      </View>

      <View style={styles.gridArea}>
        <View style={styles.grid}>
          {GRID.map(({key, labelKey, accent}) => (
            <View key={key} style={styles.cell}>
              <Text style={styles.label} numberOfLines={1}>
                {t(labelKey)}
              </Text>
              <Text style={[styles.value, accent && styles.valueAccent]} numberOfLines={1} adjustsFontSizeToFit>
                {recapStatValue(recap, key)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{dates.range}</Text>
        <Text style={styles.footerText}>{t('goalShare.daysCount', {count: recap.days})}</Text>
      </View>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  lockup: {position: 'absolute', left: PAD, top: 80},
  tier: {position: 'absolute', right: PAD, top: 103},
  head: {position: 'absolute', left: PAD, right: PAD, top: HEAD_TOP},
  pills: {flexDirection: 'row', gap: 12},
  title: {marginTop: 20, fontWeight: '800', color: g.ink},
  // Fills everything below the title; the grid is centred in it vertically.
  gridArea: {position: 'absolute', left: PAD, right: PAD, top: GRID_TOP, bottom: GRID_BOTTOM, justifyContent: 'center'},
  // No divider between the rows (owner) — the gap alone separates them.
  grid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: 88},
  cell: {width: CONTENT_W / 2, paddingRight: 32},
  label: {fontSize: 36, fontWeight: '600', color: g.labelOnLight},
  value: {marginTop: 6, fontSize: 172, lineHeight: 180, fontWeight: '900', letterSpacing: -6, color: g.ink},
  valueAccent: {color: theme.colors.accent},
  footer: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    top: 1792,
    borderTopWidth: 2,
    borderTopColor: g.ruleOnFinishCard,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {fontSize: 28, color: g.labelOnLight},
}));
