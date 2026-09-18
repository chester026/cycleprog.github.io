// T-5.3 (A-24/A-28): the outer "card" every *Analysis component drew by
// hand — big translucent uppercase title, optional subtitle, optional
// "not enough data" short-circuit, then whatever chart/list content the
// metric needs. See README.md for the per-metric marginTop/marginBottom
// diffs this parametrizes.
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

export interface MetricAnalysisSectionProps {
  title: string;
  /** PowerAnalysis's "Last 50 activities" line; the other three never had one. */
  subtitle?: string;
  /** Heart/Speed/Cadence's early-return "no data" state. */
  emptyText?: string;
  isEmpty?: boolean;
  /** Power: 32. Heart/Speed/Cadence (default): 20. */
  marginTop?: number;
  /** Cadence: 72. Default: 0. */
  marginBottom?: number;
  children?: React.ReactNode;
}

export const MetricAnalysisSection: React.FC<MetricAnalysisSectionProps> = ({
  title,
  subtitle,
  emptyText,
  isEmpty,
  marginTop = 20,
  marginBottom = 0,
  children,
}) => {
  return (
    <View style={[styles.container, {marginTop, marginBottom}]}>
      <Text style={[styles.title, {marginBottom: subtitle ? 4 : 16}]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {isEmpty ? (
        emptyText ? <Text style={styles.noDataText}>{emptyText}</Text> : null
      ) : (
        children
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  title: {
    fontSize: 60,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.2,
    color: '#d6d6d6',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 16,
  },
  noDataText: {
    color: '#b0b8c9',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
});
