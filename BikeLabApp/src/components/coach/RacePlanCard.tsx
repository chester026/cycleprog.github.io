import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  ACCENT,
  CoachCard,
  Divider,
  Eyebrow,
  IconTile,
} from './CoachCardChrome';
import { colors, makeStyles, withOpacity } from '../../theme';
import type { RacePlanCardModel } from '@bikelab/shared/types';
import { formatClock, formatKm } from './powerCardLib';
import {
  climbRows,
  flatRange,
  formatRaceTime,
  profileShape,
} from './racePlanLib';

// Shown when the coach's plan_race tool planned a course: the predicted
// time as the headline, the course profile with its climbs shaded and the
// feeds marked, what to hold on each climb, the flats' range, and the
// feeding rule. Numbers only — the coach's text below says where the race
// is decided.

const FlagIcon: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M5 17V3.5M5 4h9.5l-2 3 2 3H5"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const PROFILE_W = 300;
const PROFILE_H = 64;

export const RacePlanCard: React.FC<{ model: RacePlanCardModel }> = ({
  model,
}) => {
  const { t } = useTranslation();
  const accent = ACCENT.purple;
  const shape = profileShape(model, PROFILE_W, PROFILE_H);
  const { rows, more } = climbRows(model);
  const flats = flatRange(model);

  return (
    <CoachCard accent={accent} style={styles.card} testID="race-plan-card">
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <FlagIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>{t('coach.racePlan.eyebrow')}</Eyebrow>
      </View>
      {model.name ? (
        <Text style={styles.name} numberOfLines={1}>
          {model.name}
        </Text>
      ) : null}

      <View style={styles.timeRow}>
        <View>
          <Text style={styles.time} testID="race-plan-time">
            {formatRaceTime(model.durationS)}
          </Text>
          <Text style={styles.timeLabel}>{t('coach.racePlan.time')}</Text>
        </View>
        <View style={styles.sideStats}>
          <Text style={styles.sideStat}>
            <Text style={styles.sideStatValue}>
              {formatKm(model.distanceM)}
            </Text>{' '}
            · {model.gainM} m
          </Text>
          <Text style={styles.sideStat}>
            <Text style={styles.sideStatValue}>
              {model.avgSpeedKmh.toFixed(1)} km/h
            </Text>{' '}
            ·{' '}
            {t(model.drafting ? 'coach.racePlan.bunch' : 'coach.racePlan.solo')}
          </Text>
        </View>
      </View>

      {shape ? (
        <View style={styles.profile} testID="race-plan-profile">
          <Svg
            width="100%"
            height={PROFILE_H}
            viewBox={`0 0 ${PROFILE_W} ${PROFILE_H}`}
            preserveAspectRatio="none"
          >
            {shape.climbs.map(c => (
              <Rect
                key={c.x}
                x={c.x}
                y={0}
                width={c.width}
                height={PROFILE_H}
                fill={withOpacity(accent.icon, 0.1)}
              />
            ))}
            <Path
              d={shape.area}
              fill={withOpacity(colors.coach.rowMuted, 0.18)}
            />
            <Path
              d={shape.line}
              stroke={colors.coach.rowMuted}
              strokeWidth={1.5}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
            {shape.feeds.map(x => (
              <Rect
                key={x}
                x={x - 0.75}
                y={PROFILE_H - 8}
                width={1.5}
                height={8}
                fill={colors.coach.accents.green.icon}
              />
            ))}
          </Svg>
        </View>
      ) : null}

      <View style={styles.tiles}>
        <Tile label="NP" value={`${model.npW} W`} />
        <Tile label="IF" value={model.intensityFactor.toFixed(2)} />
        <Tile label="TSS" value={`${model.tss}`} />
      </View>

      {rows.length > 0 ? (
        <>
          <Divider />
          <Text style={styles.subhead}>{t('coach.racePlan.climbs')}</Text>
          {/* Two climbs a row — where and how long (grey), the watts, then the climb — so six
              climbs take three rows, not six. */}
          <View style={styles.climbGrid}>
            {rows.map(c => (
              <View
                key={c.startM}
                style={styles.climbCell}
                testID={`race-plan-climb-${c.startM}`}
              >
                <Text style={styles.rowMeta}>
                  {t('coach.racePlan.climbAt', {
                    km: Math.round(c.startM / 1000),
                  })}{' '}
                  · {formatClock(c.durationS)}
                  {c.eased ? ` · ${t('coach.racePlan.eased')}` : ''}
                </Text>
                <Text style={[styles.rowWatts, styles.climbWatts]}>
                  {c.lowW}–{c.highW}
                  <Text style={styles.rowUnit}> W</Text>
                </Text>
                <Text style={styles.rowTitle}>
                  {formatKm(c.distanceM)} · {c.gradePct.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
          {more > 0 ? (
            <Text style={styles.rowMeta}>
              {t('coach.racePlan.more', { count: more })}
            </Text>
          ) : null}
        </>
      ) : null}

      {flats ? (
        <View style={styles.flats} testID="race-plan-flats">
          <Text style={styles.subhead}>{t('coach.racePlan.flats')}</Text>
          <Text style={[styles.rowWatts, styles.climbWatts]}>
            {flats.low}–{flats.high}
            <Text style={styles.rowUnit}> W</Text>
          </Text>
          <Text style={styles.rowTitle}>{formatKm(flats.metres)}</Text>
        </View>
      ) : null}

      <Divider />
      <Text style={styles.subhead}>{t('coach.racePlan.fuel')}</Text>
      <Text style={styles.fuelLine} testID="race-plan-fuel">
        {t('coach.racePlan.fuelLine', {
          carbs: model.carbsPerHour,
          fluid: model.fluidPerHour,
        })}
      </Text>
      <Text style={styles.rowMeta}>
        {model.feeds.length > 0
          ? t('coach.racePlan.feeds', { count: model.feeds.length })
          : t('coach.racePlan.noFeeds')}
      </Text>
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
    marginBottom: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text.deepInk,
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  time: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: theme.colors.text.deepInk,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: theme.colors.coach.eyebrowText,
  },
  sideStats: { alignItems: 'flex-end', gap: 2, paddingBottom: 2 },
  sideStat: { fontSize: 12, color: theme.colors.coach.rowMuted },
  sideStatValue: { fontWeight: '800', color: theme.colors.text.deepInk },
  profile: { borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 14 },
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
  // Its own subhead under the climbs' grid (or first, on a course without climbs).
  flats: { marginTop: 14, marginBottom: 14 },
  climbGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  // Between the grey meta above and the climb's name below.
  climbWatts: { marginTop: 4, marginBottom: 2 },
  climbCell: { width: '50%', paddingRight: 8 },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.deepInk,
  },
  rowMeta: { fontSize: 11, color: theme.colors.coach.rowMuted, marginTop: 1 },
  rowWatts: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text.deepInk,
  },
  rowUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.coach.rowMuted,
  },
  fuelLine: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.deepInk,
  },
}));
