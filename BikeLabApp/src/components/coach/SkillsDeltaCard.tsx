import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {CoachCard} from './CoachCardChrome';

// 2-column grid of skill changes for the coach chat — redesigned to match
// the "Rich Chat Cards v2" reference's "Skills changed" card: each skill
// is its own soft mini-tile with a colored delta pill, instead of the
// previous flat rows with a small inline badge.
export interface SkillChange {
  name: string;
  previous: number;
  current: number;
  diff: number;
}

export const SkillsDeltaCard: React.FC<{changes: SkillChange[]}> = ({changes}) => {
  const {t} = useTranslation();
  if (changes.length === 0) return null;

  return (
    <CoachCard glow={false}>
      <Text style={styles.title}>{t('coach.skillsChanged')}</Text>
      <View style={styles.grid}>
        {changes.map((c, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.name} numberOfLines={1}>
              {c.name}
            </Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>
                {c.previous} → {c.current}
              </Text>
              <View style={[styles.badge, c.diff > 0 ? styles.badgePositive : styles.badgeNegative]}>
                <Text style={[styles.diff, c.diff < 0 && styles.diffNegative]}>
                  {c.diff > 0 ? '+' : ''}
                  {c.diff}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </CoachCard>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#0E0E12',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  item: {
    width: '46%',
    backgroundColor: '#FAFAFC',
    borderWidth: 1,
    borderColor: '#EFEFF2',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  name: {
    fontSize: 11,
    color: '#8A8A93',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    gap: 6,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
    color: '#0E0E12',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgePositive: {
    backgroundColor: '#DBF3E5',
  },
  badgeNegative: {
    backgroundColor: '#FCE3E3',
  },
  diff: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  diffNegative: {
    color: '#E5484D',
  },
});
