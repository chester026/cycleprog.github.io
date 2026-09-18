// T-5.3 (A-24/A-28): the horizontally-scrolling stat-card row every
// *Analysis component drew by hand. See README.md for the per-metric style
// diffs this component parametrizes (Power's cards are narrower/denser than
// Heart/Speed/Cadence's).
import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {TrendBadge} from '../TrendBadge';
import type {StatCardConfig} from './types';

export interface StatCardRowProps {
  cards: StatCardConfig[];
  /** Power: 140/12/'800'/0/'#888'/6/12/16. Heart/Speed/Cadence (default):
   * 160/16/'700'/4/'#b0b8c9'/0/0/0. */
  cardWidth?: number;
  cardPadding?: number;
  valueFontWeight?: '700' | '800';
  valueMarginBottom?: number;
  labelColor?: string;
  labelMarginTop?: number;
  /** contentContainerStyle.marginTop */
  topSpacing?: number;
  /** wrapper style.marginBottom */
  bottomSpacing?: number;
}

const StatCardRowBase: React.FC<StatCardRowProps> = ({
  cards,
  cardWidth = 160,
  cardPadding = 16,
  valueFontWeight = '700',
  valueMarginBottom = 4,
  labelColor = '#b0b8c9',
  labelMarginTop = 0,
  topSpacing = 0,
  bottomSpacing = 0,
}) => {
  if (cards.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, {marginTop: topSpacing}]}
      style={[styles.scroll, {marginBottom: bottomSpacing}]}>
      {cards.map(card => (
        <View
          key={card.key}
          style={[
            styles.card,
            {width: cardWidth, padding: cardPadding},
            card.backgroundColor ? {backgroundColor: card.backgroundColor} : null,
          ]}>
          {card.trend !== undefined ? (
            <View style={styles.valueRow}>
              <Text style={[styles.value, {fontWeight: valueFontWeight, marginBottom: valueMarginBottom}]}>
                {card.value}
              </Text>
              <TrendBadge value={card.trend} />
            </View>
          ) : (
            <Text style={[styles.value, {fontWeight: valueFontWeight, marginBottom: valueMarginBottom}]}>
              {card.value}
            </Text>
          )}
          <Text style={[styles.label, {color: labelColor, marginTop: labelMarginTop}]}>{card.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

export const StatCardRow = React.memo(StatCardRowBase);

const styles = StyleSheet.create({
  scroll: {
    zIndex: 1,
  },
  content: {
    paddingHorizontal: 0,
    gap: 8,
    zIndex: 1,
  },
  card: {
    backgroundColor: '#222',
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontSize: 24,
    color: '#fff',
  },
  label: {
    fontSize: 11,
    textAlign: 'center',
  },
});
