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
import { makeStyles } from '../../theme';
import type { PowerProfileCardModel } from '@bikelab/shared/types';
import { durationLabelKey, formatEffortDate } from './powerCardLib';

// Shown when the coach's get_power_profile tool returns a profile: FTP as
// the headline with W/kg beside it, then the 12-week power curve — five
// durations, each bar scaled to the 5-second best so the curve reads as a
// curve (the rider's shape: a sprinter's bars fall away fast, a
// diesel's stay tall). One row stays plain if a duration has no ride long
// enough. Same chrome as every other rich card ("Rich Chat Cards v2").

const BoltIcon: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
    <Path
      d="M11.5 2 4.5 11h5l-1 7 7-9h-5l1-7Z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </Svg>
);

export const PowerProfileCard: React.FC<{ model: PowerProfileCardModel }> = ({
  model,
}) => {
  const { t } = useTranslation();
  const accent = ACCENT.purple;
  const max = Math.max(...model.efforts.map(e => e.watts));

  return (
    <CoachCard accent={accent} style={styles.card} testID="power-profile-card">
      <View style={styles.headRow}>
        <IconTile accent={accent}>
          <BoltIcon color={accent.icon} />
        </IconTile>
        <Eyebrow>
          {t('coach.powerProfile.eyebrow', { weeks: model.weeks })}
        </Eyebrow>
      </View>

      {model.ftpWatts !== null ? (
        <>
          <Text style={styles.ftpLabel}>{t('coach.powerProfile.ftp')}</Text>
          <View style={styles.ftpRow}>
            <Text style={styles.ftpValue}>
              {model.ftpWatts}
              <Text style={styles.ftpUnit}> W</Text>
            </Text>
            {model.wPerKg !== null ? (
              <View style={styles.wkgWrap}>
                <StatusPill
                  color={accent.icon}
                  tint={accent.tint}
                  label={`${model.wPerKg.toFixed(1)} W/kg`}
                />
              </View>
            ) : null}
          </View>
        </>
      ) : (
        <Text style={styles.noFtp}>{t('coach.powerProfile.noFtp')}</Text>
      )}
      {model.ftpWatts !== null && model.ftpMethod ? (
        <Text style={styles.ftpCaption}>
          {t(`coach.powerProfile.method.${model.ftpMethod}`)}
          {model.ftpDate ? ` · ${formatEffortDate(model.ftpDate)}` : ''}
          {model.ftpEstimatedWatts !== null
            ? ` · ${t('coach.powerProfile.estimated', {
                watts: model.ftpEstimatedWatts,
              })}`
            : ''}
        </Text>
      ) : null}

      <Divider />

      {model.efforts.map(e => (
        <View
          key={e.seconds}
          style={styles.row}
          testID={`power-profile-row-${e.seconds}`}
        >
          <Text style={styles.rowLabel}>{t(durationLabelKey(e.seconds))}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(6, Math.round((e.watts / max) * 100))}%`,
                  backgroundColor: accent.icon,
                },
              ]}
            />
          </View>
          <Text style={styles.rowWatts}>{e.watts} W</Text>
          <Text style={styles.rowDate}>
            {e.date ? formatEffortDate(e.date) : ''}
          </Text>
        </View>
      ))}
      <Text style={styles.footnote}>
        {t('coach.powerProfile.footnote', { count: model.ridesWithPower })}
      </Text>
    </CoachCard>
  );
};

const styles = makeStyles(theme => ({
  card: { minWidth: 280 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  ftpRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ftpValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
    color: theme.colors.text.deepInk,
  },
  ftpUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.coach.rowMuted,
  },
  wkgWrap: { paddingTop: 4 },
  ftpLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: theme.colors.coach.eyebrowText,
    marginBottom: 2,
  },
  ftpCaption: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.coach.rowMuted,
  },
  noFtp: { fontSize: 13, lineHeight: 18, color: theme.colors.coach.rowMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  rowLabel: {
    width: 44,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.coach.trendChart.legendText,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.coach.divider,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  rowWatts: {
    width: 52,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text.deepInk,
  },
  rowDate: {
    width: 44,
    textAlign: 'right',
    fontSize: 10,
    color: theme.colors.coach.rowMuted,
  },
  footnote: { marginTop: 10, fontSize: 11, color: theme.colors.coach.rowMuted },
}));
