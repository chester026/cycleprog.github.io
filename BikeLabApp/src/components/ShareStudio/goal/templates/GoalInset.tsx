/**
 * 06 · Inset card — a dark surface inset on the blue page with an even
 * blue frame all round (owner redesign: the old off-centre card left a
 * blue gap at the bottom, the handwritten line up the edge read oddly, and
 * a 322px distance hero dwarfed its 26px labels).
 *
 * Layout is flex, not absolute: the header (tier + dates, title) sits at
 * the top of the card, the 2x2 numbers grid and the lockup are pinned to
 * the bottom, and whatever space the title leaves goes in between — so a
 * one-line title and a three-line one both balance.
 */
import React from 'react';
import {View, Text, Image} from 'react-native';
import {useTranslation} from 'react-i18next';
import {GoalCanvas, BrandLockup, TierPill, GoalTitle, LongArrow, recapStatValue, W, H, type RecapStatKey} from './parts';
import type {GoalTemplateProps} from './types';
import {colors, makeStyles} from '../../../../theme';

const symbolLogo = require('../../../../assets/img/shareTemplates/logos/symbol.png');

const g = colors.share.goal;
const FRAME = 48; // blue frame, same on every side
const CARD_PAD = 72;
const CONTENT_W = W - 2 * (FRAME + CARD_PAD);

// Distance leads (bright blue), the other three are the same size — one
// scale for all four numbers instead of a single giant hero.
const GRID: Array<{key: RecapStatKey; labelKey: string; accent?: boolean}> = [
  {key: 'distance', labelKey: 'goalShare.label.distanceKm', accent: true},
  {key: 'elevation', labelKey: 'goalShare.label.elevationM'},
  {key: 'rides', labelKey: 'goalShare.label.rides'},
  {key: 'hours', labelKey: 'goalShare.label.saddleH'},
];

export const GoalInset: React.FC<GoalTemplateProps> = ({goalTitle, tier, recap, dates}) => {
  const {t} = useTranslation();
  return (
    <GoalCanvas backgroundColor={colors.accent}>
      <View style={styles.card}>
        <View style={styles.tab}>
          <Image source={symbolLogo} style={styles.tabImage} resizeMode="contain" />
        </View>

        <View>
          <View style={styles.meta}>
            <TierPill tier={tier} />
            <Text style={styles.metaText}>
              {dates.rangeShort} · {t('goalShare.daysCount', {count: recap.days})}
            </Text>
          </View>
          <GoalTitle
            title={goalTitle}
            lines={3}
            width={CONTENT_W}
            fontSize={128}
            lineHeight={125}
            letterSpacing={-2}
            style={styles.title}
          />
        </View>

        <View>
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

          <View style={styles.footer}>
            <BrandLockup tone="onDark" showSymbol={false} />
            <LongArrow width={156} />
          </View>
        </View>
      </View>
    </GoalCanvas>
  );
};

const styles = makeStyles(theme => ({
  card: {
    position: 'absolute',
    left: FRAME,
    top: FRAME,
    width: W - 2 * FRAME,
    height: H - 2 * FRAME,
    padding: CARD_PAD,
    backgroundColor: g.darkCard,
    justifyContent: 'space-between',
  },
  // The B tab hangs off the card's top-right corner, flush with its edge.
  // Scaled 2.4x from the original 54x68 tab (owner: bigger logo); the
  // image crop offsets scale with it so the B stays centred in the tab.
  tab: {position: 'absolute', right: CARD_PAD, top: 0, width: 130, height: 163, overflow: 'hidden'},
  tabImage: {width: 156, height: 192, marginLeft: -12.7, marginTop: -42},
  meta: {flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 56},
  metaText: {fontSize: 34, fontWeight: '500', color: g.labelOnDark},
  title: {marginTop: 84, fontWeight: '800', color: theme.colors.text.inverse},
  grid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: 56},
  cell: {
    width: CONTENT_W / 2,
    paddingRight: 32,
    paddingTop: 28,
    borderTopWidth: 2,
    borderTopColor: g.ruleOnDark,
  },
  label: {fontSize: 36, fontWeight: '500', color: g.labelOnDark},
  value: {
    marginTop: 8,
    fontSize: 140,
    lineHeight: 150,
    fontWeight: '800',
    letterSpacing: -5,
    color: theme.colors.text.inverse,
  },
  valueAccent: {color: g.brightBlue},
  footer: {
    marginTop: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
}));
