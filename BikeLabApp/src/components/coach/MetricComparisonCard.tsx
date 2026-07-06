import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

// Compact "before -> after" comparison card for the coach chat — used for
// both vs-baseline and vs-similar-ride comparisons from get_activity_analysis.
// Same visual language as GoalCreatedCard/RideScoreCard (white card, blue
// accent, light theme matching the chat rather than the dashboard's dark
// theme).
export interface MetricRow {
  label: string;
  oldValue: string;
  newValue: string;
  /** Highlights newValue green when the change is in the "good" direction. */
  isPositive?: boolean;
}

export const MetricComparisonCard: React.FC<{
  title: string;
  subtitle?: string;
  rows: MetricRow[];
}> = ({title, subtitle, rows}) => {
  if (rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      <View style={styles.rows}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <View style={styles.values}>
              <Text style={styles.oldValue}>{row.oldValue}</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={[styles.newValue, row.isPositive && styles.better]}>{row.newValue}</Text>
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
    borderRadius: 12,
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
  },
  subtitle: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
    marginBottom: 6,
  },
  rows: {
    gap: 6,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 12,
    color: '#888',
  },
  values: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  oldValue: {
    fontSize: 12,
    color: '#bbb',
  },
  arrow: {
    fontSize: 12,
    color: '#bbb',
  },
  newValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  better: {
    color: '#10b981',
  },
});
