/**
 * 05 · Finish line — light page with the wash. "You set it. You rode it.
 * [Goal complete.]", the title, a start→finish track at 100% and a dark
 * 2x2 numbers card.
 */
import React from 'react';
import {View, Text} from 'react-native';
import {useTranslation} from 'react-i18next';
import {GoalCanvas, PastelWash, BrandLockup, TierPill, GoalTitle, recapStatValue, PAD, W, type RecapStatKey} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const g = colors.share.goal;

// Same grid as Inset (owner): distance leads in accent blue, a single
// divider between the two rows, labels big enough to read next to the numbers.
const GRID: Array<{key: RecapStatKey; labelKey: string; accent?: boolean}> = [
  {key: 'distance', labelKey: 'goalShare.label.distanceKm', accent: true},
  {key: 'elevation', labelKey: 'goalShare.label.elevationM'},
  {key: 'rides', labelKey: 'goalShare.label.rides'},
  {key: 'hours', labelKey: 'goalShare.label.saddleH'},
];
const CARD_PAD = 48;
const CARD_INNER_W = W - 2 * PAD - 2 * CARD_PAD;

export const GoalFinish: React.FC<GoalTemplateProps> = ({goalTitle, tier, recap, dates}) => {
  const {t} = useTranslation();
  return (
    <GoalCanvas backgroundColor={g.lightBg}>
      <PastelWash />
      <BrandLockup tone="onLight" style={styles.lockup} />
      <TierPill tier={tier} style={styles.tier} />

      <View style={styles.kicker}>
        <Text style={styles.kickerText}>{t('goalShare.finish.line1')}</Text>
        <View style={styles.kickerChip}>
          <Text style={[styles.kickerText, styles.kickerBlue]}>{t('goalShare.goalCompleted')}</Text>
        </View>
      </View>

      <GoalTitle title={goalTitle} lines={2} width={936} fontSize={155} lineHeight={130} letterSpacing={-6} style={styles.title} />

      <View style={styles.track}>
        <View style={styles.trackRow}>
          <Text style={styles.trackLabel}>
            {t('goalShare.finish.start')} <Text style={styles.trackStrong}>{dates.start}</Text>
          </Text>
          <Text style={styles.trackLabel}>
            {t('goalShare.finish.finish')} <Text style={styles.trackStrong}>{dates.finish}</Text>
          </Text>
        </View>
        <View style={styles.line}>
          <View style={styles.lineFill} />
          <View style={styles.startDot} />
          <View style={styles.endDot} />
        </View>
        <View style={styles.trackRow}>
          <Text style={styles.trackLabel}>{t('goalShare.daysCount', {count: recap.days})}</Text>
          <Text style={styles.trackStrong}>100%</Text>
        </View>
      </View>

      <View style={styles.card}>
        {GRID.map(({key, labelKey, accent}, i) => (
          <View key={key} style={[styles.cell, i >= 2 && styles.cellRuled]}>
            <Text style={styles.label} numberOfLines={1}>
              {t(labelKey)}
            </Text>
            <Text style={[styles.value, accent && styles.valueAccent]} numberOfLines={1} adjustsFontSizeToFit>
              {recapStatValue(recap, key)}
            </Text>
          </View>
        ))}
      </View>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  lockup: {position: 'absolute', left: PAD, top: 80},
  tier: {position: 'absolute', right: PAD, top: 103},
  kicker: {position: 'absolute', left: PAD, right: PAD, top: 322, alignItems: 'flex-start'},
  kickerText: {fontSize: 69, lineHeight: 72, fontWeight: '800', letterSpacing: -3, color: g.ink},
  // g.surfaceElevated never existed, so the chip always rendered without a
  // fill — kept that way (no background), just without the broken token.
  kickerChip: {paddingHorizontal: 10},
  kickerBlue: {color: theme.colors.accent},
  title: {
    position: 'absolute',
    left: PAD,
    top: 640,
    fontWeight: '800',
    color: g.ink,
  },
  track: {position: 'absolute', left: PAD, right: PAD, top: 1083, gap: 22},
  trackRow: {flexDirection: 'row', justifyContent: 'space-between'},
  trackLabel: {fontSize: 28, color: g.labelOnLight},
  trackStrong: {fontSize: 28, fontWeight: '800', color: g.ink},
  line: {height: 34, justifyContent: 'center'},
  lineFill: {height: 10, marginHorizontal: 12, backgroundColor: theme.colors.accent},
  startDot: {
    position: 'absolute',
    left: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 6,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.text.inverse,
  },
  endDot: {position: 'absolute', right: 0, width: 40, height: 40, borderRadius: 24, backgroundColor: theme.colors.accent},
  // Height follows the content; anchored to the bottom edge instead of a
  // fixed top so the taller grid never runs off the frame.
  card: {
    position: 'absolute',
    left: PAD,
    right: PAD,
    bottom: 80,
    borderRadius: 36,
    // Light blue-grey instead of the old dark card (owner).
    backgroundColor: g.finishCard,
    padding: CARD_PAD,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 40,
  },
  cell: {width: CARD_INNER_W / 2, paddingRight: 24},
  // Only the second row gets a rule — a single divider through the middle
  // of the card (owner: no line along the card's top edge).
  cellRuled: {paddingTop: 28, borderTopWidth: 2, borderTopColor: g.ruleOnFinishCard},
  label: {fontSize: 34, fontWeight: '500', color: g.labelOnLight},
  value: {
    marginTop: 6,
    fontSize: 120,
    lineHeight: 128,
    fontWeight: '800',
    letterSpacing: -5,
    color: g.ink,
  },
  valueAccent: {color: theme.colors.accent},
}));
