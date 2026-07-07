import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';

// 2-column grid of skill changes for the coach chat — same visual pattern as
// RideAnalyticsScreen's old "Impact on Stats" changesGrid, just as a
// standalone light-theme card instead of a dark dashboard section.
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
    <View style={styles.card}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 12,
    marginTop: 6,
    marginBottom: 4,
    maxWidth: '90%',
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  item: {
    width: '46%',
  },
  name: {
    fontSize: 11,
    color: '#888',
    marginBottom: 3,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgePositive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  diff: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10b981',
  },
  diffNegative: {
    color: '#ef4444',
  },
});
