// Vertical "time in zones" bars shared by the power profile and the HR zones
// on the ride screen: one bar per zone, height = share of the ride, labels
// under a single baseline. The caller decides the colour of each bar
// (`barColor`) — power uses one quiet tone with the dominant zone in the
// brand accent, heart rate uses shades of red by rank (owner, 30.10.2026).
import React from 'react';
import {Text, View} from 'react-native';
import {makeStyles} from '../../theme';

export interface ZoneBarItem {
  key: string;
  /** Big label under the bar, e.g. "Z3". */
  label: string;
  /** Small label under it, e.g. the zone's upper bound. */
  sublabel: string;
  percent: number;
}

interface ZoneBarsProps {
  items: ZoneBarItem[];
  barColor: (item: ZoneBarItem, rank: number) => string;
  /** Percent labels of these keys are drawn bright; the rest muted. */
  emphasizeKeys?: string[];
  testIdPrefix: string;
}

const BAR_AREA_HEIGHT = 96;

/** Rank of each item by percent, 0 = largest share (ties keep order). */
export function rankByPercent(items: ZoneBarItem[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => b.percent - a.percent);
  return new Map(sorted.map((it, i) => [it.key, i]));
}

export const ZoneBars: React.FC<ZoneBarsProps> = ({items, barColor, emphasizeKeys = [], testIdPrefix}) => {
  const maxPercent = Math.max(1, ...items.map(z => z.percent));
  const ranks = rankByPercent(items);
  return (
    <>
      <View style={styles.bars}>
        {items.map(z => {
          const h = Math.max(3, Math.round((z.percent / maxPercent) * BAR_AREA_HEIGHT));
          const bright = emphasizeKeys.includes(z.key) && z.percent > 0;
          return (
            <View key={z.key} style={styles.barCol} testID={`${testIdPrefix}-${z.key}`}>
              <Text style={[styles.percent, bright && styles.percentBright]}>{z.percent > 0 ? `${z.percent}%` : ''}</Text>
              <View style={styles.barArea}>
                <View style={[styles.barFill, {height: h, backgroundColor: barColor(z, ranks.get(z.key) ?? 0)}]} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.baseline} />
      <View style={styles.labels}>
        {items.map(z => (
          <View key={z.key} style={styles.barCol}>
            <Text style={styles.zoneLabel}>{z.label}</Text>
            <Text style={styles.zoneRange}>{z.sublabel}</Text>
          </View>
        ))}
      </View>
    </>
  );
};

const styles = makeStyles(theme => ({
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing[16],
    gap: theme.spacing[10],
  },
  labels: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing[16],
    gap: theme.spacing[10],
    marginTop: theme.spacing[8],
  },
  barCol: {flex: 1, alignItems: 'center'},
  percent: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.45)',
    marginBottom: theme.spacing[6],
    height: 14,
  },
  percentBright: {color: theme.colors.text.inverse},
  barArea: {width: '100%', height: BAR_AREA_HEIGHT, justifyContent: 'flex-end'},
  barFill: {width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4},
  baseline: {
    marginHorizontal: theme.spacing[16],
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  zoneLabel: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  zoneRange: {fontSize: 10, color: 'rgba(255, 255, 255, 0.3)'},
}));
