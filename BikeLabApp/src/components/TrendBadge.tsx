import React from 'react';
import {Text, StyleSheet} from 'react-native';

interface TrendBadgeProps {
  value?: number | null;
}

// Diff vs the previous period — triangle + colored text, no background.
// Matches ProgressChart's scoreDelta convention (see scoreDelta /
// deltaPositive / deltaNegative in ProgressChart.tsx) rather than the old
// solid-background pill each of PowerAnalysis / HeartAnalysis /
// CadenceAnalysis / GarageScreen used to draw with its own copy-pasted
// TrendBadge. This is the one shared version all four now import.
export const TrendBadge: React.FC<TrendBadgeProps> = ({value}) => {
  if (value === undefined || value === null || value === 0) return null;
  const positive = value > 0;
  return (
    <Text style={[styles.trend, positive ? styles.trendPositive : styles.trendNegative]}>
      {positive ? '▲' : '▼'} {Math.abs(value)}
    </Text>
  );
};

const styles = StyleSheet.create({
  trend: {
    fontSize: 12,
    fontWeight: '700',
  },
  trendPositive: {
    color: '#16a34a',
  },
  trendNegative: {
    color: '#ef4444',
  },
});
