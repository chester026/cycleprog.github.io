import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import {
  ACCENT,
  CoachCard,
  Divider,
  Eyebrow,
  IconTile,
  StatusPill,
} from './CoachCardChrome';
import { colors, makeStyles, withOpacity } from '../../theme';
import type { RidePowerCardModel } from '@bikelab/shared/types';
import {
  durationLabelKey,
  formatClock,
  formatKm,
  pacingTone,
} from './powerCardLib';

// Shown when the coach's get_ride_power_breakdown tool returns a
// power-meter ride: NP as the headline (with avg and max beside it),
// IF / TSS / VI tiles when there's an FTP, the ride's own best efforts as a
// compact row of tiles, the longest climbs with watts · HR · speed, and a
// pacing pill (even / negative split / faded / surgy) with the half-to-half
// change. Numbers only — the coach's text right below says what they mean.

const WaveIcon: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M2 12c2.5 0 2.5-6 5-6s2.5 8 5 8 2.5-6 5-6"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
    />
  </Svg>
);

const PACING_COLOR: Record<
  NonNullable<ReturnType<typeof pacingTone>>,
  string
> = {
  even: colors.coach.accents.green.icon,
  negative: colors.coach.accents.green.icon,
  faded: colors.coach.accents.amber.icon,
  surgy: colors.coach.accents.amber.icon,
};

export const RidePowerCard: React.FC<{ model: RidePowerCardModel }> = ({
  model,
}) => {
  const { t } = useTranslation();
  const accent = ACCENT.blue;
  const tone = pacingTone(model.vi, model.fadePct);
  const hasFtp = model.intensityFactor !== null && model.tss !== null;

  return (
    <CoachCard accent={accent} style={styles.card} testID="ride-power-card">
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <WaveIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.ridePower.eyebrow')}</Eyebrow>
      </View>

      <View style={styles.npRow}>
        <View>
          <Text style={styles.npValue}>
            {model.npW}
            <Text style={styles.npUnit}> W</Text>
          </Text>
          <Text style={styles.npLabel}>{t('coach.ridePower.np')}</Text>
        </View>
        <View style={styles.sideStats}>
          <Text style={styles.sideStat}>
            <Text style={styles.sideStatValue}>{model.avgW} W</Text>{' '}
            {t('coach.ridePower.avg')}
          </Text>
          <Text style={styles.sideStat}>
            <Text style={styles.sideStatValue}>{model.maxW} W</Text>{' '}
            {t('coach.ridePower.max')}
          </Text>
        </View>
      </View>

      <View style={styles.tiles}>
        {hasFtp ? (
          <>
            <Tile
              label="IF"
              value={(model.intensityFactor as number).toFixed(2)}
            />
            <Tile label="TSS" value={`${model.tss}`} />
          </>
        ) : null}
        <Tile label="VI" value={model.vi.toFixed(2)} />
        {model.coastingPct !== null ? (
          <Tile
            label={t('coach.ridePower.coasting')}
            value={`${model.coastingPct}%`}
          />
        ) : null}
      </View>

      {model.efforts.length > 0 ? (
        <>
          <Divider />
          <Text style={styles.subhead}>{t('coach.ridePower.bestEfforts')}</Text>
          <View style={styles.efforts}>
            {model.efforts.map(e => (
              <View
                key={e.seconds}
                style={styles.effort}
                testID={`ride-power-effort-${e.seconds}`}
              >
                <Text style={styles.effortWatts}>{e.watts}</Text>
                <Text style={styles.effortLabel}>
                  {t(durationLabelKey(e.seconds))}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {model.climbs.length > 0 ? (
        <>
          <Divider />
          <Text style={styles.subhead}>{t('coach.ridePower.climbs')}</Text>
          {model.climbs.map(c => (
            <View
              key={c.startS}
              style={styles.climb}
              testID={`ride-power-climb-${c.startS}`}
            >
              <View style={styles.climbHead}>
                <Text style={styles.climbTitle}>
                  {formatKm(c.distanceM)} · {c.gradePct.toFixed(1)}%
                </Text>
                <Text style={styles.climbAt}>{formatClock(c.startS)}</Text>
              </View>
              <Text style={styles.climbStats}>
                <Text style={styles.climbWatts}>
                  {c.avgW !== null ? `${c.avgW} W` : '–'}
                </Text>
                {c.avgHr !== null ? `  ·  ${c.avgHr} bpm` : ''}
                {`  ·  ${c.avgSpeedKmh.toFixed(1)} km/h  ·  ${formatClock(
                  c.durationS,
                )}`}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {tone ? (
        <View style={styles.pacingRow}>
          <StatusPill
            color={PACING_COLOR[tone]}
            tint={withOpacity(PACING_COLOR[tone], 0.12)}
            label={t(`coach.ridePower.pacing.${tone}`)}
          />
          <Text style={styles.pacingText}>
            {t('coach.ridePower.halves', {
              pct: Math.round(model.fadePct as number),
            })}
          </Text>
        </View>
      ) : null}
    </CoachCard>
  );
};

const Tile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.tile}>
    <Text style={styles.tileValue}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>
);

const styles = makeStyles(theme => ({
  card: { minWidth: 280 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  npRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  npValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
    color: theme.colors.text.deepInk,
  },
  npUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.coach.rowMuted,
  },
  npLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.coach.eyebrowText,
  },
  sideStats: { alignItems: 'flex-end', gap: 2, paddingBottom: 2 },
  sideStat: { fontSize: 12, color: theme.colors.coach.rowMuted },
  sideStatValue: { fontWeight: '700', color: theme.colors.text.deepInk },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.coach.divider,
  },
  tileValue: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text.deepInk,
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.coach.eyebrowText,
    marginTop: 2,
  },
  subhead: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.coach.eyebrowText,
    marginBottom: 8,
  },
  efforts: { flexDirection: 'row', justifyContent: 'space-between' },
  effort: { alignItems: 'center', minWidth: 44 },
  effortWatts: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text.deepInk,
  },
  effortLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.coach.rowMuted,
    marginTop: 1,
  },
  climb: { paddingVertical: 5 },
  climbHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  climbTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.deepInk,
  },
  climbAt: { fontSize: 11, color: theme.colors.coach.rowMuted },
  climbStats: {
    fontSize: 12,
    color: theme.colors.coach.rowMuted,
    marginTop: 2,
  },
  climbWatts: {
    fontWeight: '800',
    color: theme.colors.coach.accents.blue.icon,
  },
  pacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  pacingText: { fontSize: 12, color: theme.colors.coach.rowMuted },
}));
