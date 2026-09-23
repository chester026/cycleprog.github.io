// T-5.3 (A-24/A-28): PowerAnalysis's "Top 5" horizontally-scrolling activity
// cards — the only *Analysis component with a per-activity list (Heart/
// Speed/Cadence only ever show charts; FTP shows neither). Kept as a
// ScrollView (not FlatList) since it's capped at 5 items, same as the
// original — FlatList only pays off past ~10 items (see GUIDE-5.md T-5.3).
import React from 'react';
import {View, Text, ScrollView} from 'react-native';
import {getDateLocale} from '../../i18n/dateLocale';
import type {ActivityMetricListItem} from './types';
import {makeStyles} from '../../theme';

export interface ActivityMetricListProps {
  title: string;
  items: ActivityMetricListItem[];
}

const ActivityRow: React.FC<{item: ActivityMetricListItem; rank: number}> = React.memo(
  ({item, rank}) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.value}>{item.valueLabel}</Text>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{rank}</Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.date}>
        {new Date(item.date).toLocaleDateString(getDateLocale(), {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </Text>
      {item.badgeText ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badgeText}</Text>
        </View>
      ) : null}
    </View>
  ),
);

export const ActivityMetricList: React.FC<ActivityMetricListProps> = ({title, items}) => {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}>
        {items.map((item, index) => (
          <ActivityRow key={item.id} item={item} rank={index + 1} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    marginBottom: 20,
  },
  scroll: {
    marginTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 0,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text.inverse,
    marginBottom: 0,
    letterSpacing: 0.5,
    marginTop: 16,
  },
  card: {
    width: 200,
    backgroundColor: theme.colors.surfaceDark,
    padding: 16,
    borderRadius: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.inverse,
    marginBottom: 6,
  },
  date: {
    fontSize: 11,
    color: theme.colors.text.muted,
    marginBottom: 8,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  badge: {
    backgroundColor: theme.colors.success,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 9,
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
}));
