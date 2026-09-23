// Checklist's overview card — same ring + right-side rows layout as
// BikeGarage/OverviewCard.tsx (owner request: redesign Checklist in
// BikeGarage's visual language), with the "ask coach" banner attached to
// its bottom edge so the two read as one solid card, exactly as
// BikeGarage's does (owner feedback, 19.09). The ring reuses BikeGarage's
// exact gauge constants/geometry so the two screens' rings are
// pixel-identical; this card shows checklist stats instead of bike health,
// so the JSX isn't shared beyond that.
import React from 'react';
import {Text, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Circle} from 'react-native-svg';
import {makeStyles, useTheme} from '../../theme';
import {GAUGE_SIZE, GAUGE_STROKE, GAUGE_RADIUS, GAUGE_CIRCUMFERENCE} from '../BikeGarage/lib';
import {checklistStatus, type ChecklistOverview} from './lib';
import {ChecklistCoachBanner} from './CoachBanner';

export interface ChecklistOverviewCardProps {
  overview: ChecklistOverview;
  onAskCoach: () => void;
}

export const ChecklistOverviewCard: React.FC<ChecklistOverviewCardProps> = ({overview, onAskCoach}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const status = checklistStatus(overview.percent);

  const rows = [
    {key: 'open', label: t('checklist.overview.open'), value: overview.openItems},
    {key: 'done', label: t('checklist.overview.done'), value: overview.doneItems},
    {key: 'sections', label: t('checklist.overview.sections'), value: overview.totalSections},
  ];

  return (
    <View style={styles.card}>
      <View style={styles.inner}>
        <View style={styles.top}>
          <View style={styles.gaugeWrap}>
            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
              <Circle
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={GAUGE_RADIUS}
                stroke={theme.colors.garage.gaugeTrack}
                strokeWidth={GAUGE_STROKE}
                fill="none"
              />
              <Circle
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={GAUGE_RADIUS}
                stroke={theme.colors.text.primary}
                strokeWidth={GAUGE_STROKE}
                fill="none"
                strokeDasharray={`${(overview.percent / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                strokeLinecap="round"
                rotation={-90}
                origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
              />
            </Svg>
            <View style={styles.gaugeLabel}>
              <View style={styles.gaugeValRow}>
                <Text style={styles.gaugeVal}>{overview.percent}</Text>
                <Text style={styles.gaugeSuffix}>%</Text>
              </View>
              <Text style={styles.gaugeCaption}>{t('checklist.overview.done').toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.info}>
            <Text style={styles.title}>{t(`checklist.status.${status}`)}</Text>
            <View style={styles.rows}>
              {rows.map(item => (
                <View key={item.key} style={styles.row}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowVal}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      <ChecklistCoachBanner onPress={onAskCoach} />
    </View>
  );
};

const styles = makeStyles(theme => ({
  card: {
    backgroundColor: theme.colors.surfaceElevated,
    marginTop: theme.spacing[16],
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 10, height: 24},
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
  },
  inner: {padding: theme.spacing[24], paddingBottom: theme.spacing[20]},
  top: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing[32]},
  gaugeWrap: {width: GAUGE_SIZE, height: GAUGE_SIZE, justifyContent: 'center', alignItems: 'center'},
  gaugeLabel: {position: 'absolute', alignItems: 'center', justifyContent: 'center'},
  gaugeValRow: {flexDirection: 'row', alignItems: 'baseline'},
  gaugeVal: {fontSize: 32, fontWeight: '800', letterSpacing: -1.5, color: theme.colors.text.primary},
  gaugeSuffix: {fontSize: theme.typography.fontSize.lg, fontWeight: '600', color: theme.colors.text.iosMuted, marginLeft: 1},
  gaugeCaption: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.colors.text.iosMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  info: {flex: 1, justifyContent: 'center'},
  title: {fontSize: 18, fontWeight: '700', color: theme.colors.text.primary, marginBottom: theme.spacing[14], letterSpacing: -0.3},
  rows: {gap: theme.spacing[8]},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  rowLabel: {fontSize: theme.typography.fontSize.md, fontWeight: '500', color: theme.colors.text.iosMuted},
  rowVal: {fontSize: theme.typography.fontSize.lg, fontWeight: '800', color: theme.colors.text.primary},
}));
