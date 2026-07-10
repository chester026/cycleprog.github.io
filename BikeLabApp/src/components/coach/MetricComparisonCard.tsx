import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {CoachCard} from './CoachCardChrome';

// "vs Your Average"-style comparison card for the coach chat — used for
// both vs-baseline and vs-similar-ride comparisons from get_activity_analysis.
// Redesigned to match the "Rich Chat Cards v2" reference: plain title, then
// divided rows with the new value shown as a colored pill instead of plain
// bold text.
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
    <CoachCard glow={false}>
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
          <View key={i} style={[styles.row, i > 0 && styles.rowDivider]}>
            <Text style={styles.label}>{row.label}</Text>
            <View style={styles.values}>
              <Text style={styles.oldValue}>{row.oldValue}</Text>
              <Text style={styles.arrow}>→</Text>
              <View style={[styles.pill, row.isPositive ? styles.pillPositive : styles.pillNeutral]}>
                <Text style={[styles.newValue, row.isPositive && styles.better]}>{row.newValue}</Text>
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
  subtitle: {
    fontSize: 12,
    color: '#9A9AA2',
    marginTop: 2,
  },
  rows: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#F1F1F4',
  },
  label: {
    fontSize: 13,
    color: '#61616B',
  },
  values: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  oldValue: {
    fontSize: 12,
    color: '#B6B6BC',
  },
  arrow: {
    fontSize: 12,
    color: '#CFCFD4',
  },
  pill: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pillNeutral: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  pillPositive: {
    backgroundColor: 'rgba(31,177,107,0.10)',
  },
  newValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0E0E12',
  },
  better: {
    color: '#12965A',
  },
});
