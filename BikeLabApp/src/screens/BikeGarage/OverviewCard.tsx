// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b): the gauge + rider profile card, and the "ask coach" footer
// beneath it. Pixel-identical to the original inline block.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import Svg, {Circle} from 'react-native-svg';
import {SparkleIcon} from '../../assets/img/icons/SparkleIcon';
import {makeStyles} from '../../theme';
import {GAUGE_SIZE, GAUGE_STROKE, GAUGE_RADIUS, GAUGE_CIRCUMFERENCE, rankRidingStyle} from './lib';
import type {BikeHealth} from './types';

const GAUGE_COLOR = '#1A1A1A';

interface OverviewCardProps {
  health: BikeHealth;
  onAskCoach: () => void;
}

export const OverviewCard: React.FC<OverviewCardProps> = ({health, onAskCoach}) => {
  const {t} = useTranslation();
  const ranked = rankRidingStyle(health.ridingStyle, {
    climbing: t('skills.climbing'),
    sprint: t('skills.sprint'),
    power: t('skills.power'),
  });

  return (
    <View style={styles.overviewBlock}>
      <View style={styles.overviewInner}>
        <View style={styles.overviewTop}>
          <View style={styles.gaugeWrap}>
            <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
              <Circle
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={GAUGE_RADIUS}
                stroke="#DDDDE0"
                strokeWidth={GAUGE_STROKE}
                fill="none"
              />
              <Circle
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={GAUGE_RADIUS}
                stroke={GAUGE_COLOR}
                strokeWidth={GAUGE_STROKE}
                fill="none"
                strokeDasharray={`${(health.overallHealth / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                strokeLinecap="round"
                rotation={-90}
                origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
              />
            </Svg>
            <View style={styles.gaugeLabel}>
              <View style={styles.gaugeValRow}>
                <Text style={styles.gaugeVal}>{health.overallHealth}</Text>
                <Text style={styles.gaugeSuffix}>%</Text>
              </View>
              <Text style={styles.gaugeCaption}>{t('bikeGarage.bikeHealth')}</Text>
            </View>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileTitle}>{health.riderProfile?.profile || 'Rider'}</Text>
            <View style={styles.styleBars}>
              {ranked.map(item => (
                <View key={item.key} style={styles.sBar}>
                  <Text style={styles.sBarLabel}>{item.label}</Text>
                  <Text style={styles.sBarVal}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.coachFooter} activeOpacity={0.85} onPress={onAskCoach}>
        <View style={styles.coachFooterIcon}>
          <SparkleIcon size={32} color="#274dd3" />
        </View>
        <View style={styles.coachFooterText}>
          <Text style={styles.coachFooterTitle}>{t('bikeGarage.askCoach')}</Text>
          <Text style={styles.coachFooterSubtitle}>{t('bikeGarage.askCoachSubtitle')}</Text>
        </View>
        <Text style={styles.coachFooterChevron}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  overviewBlock: {
    backgroundColor: theme.colors.surfaceElevated,
    marginBottom: 0,
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
  overviewInner: {padding: theme.spacing[24], paddingBottom: theme.spacing[20]},
  overviewTop: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing[32]},
  coachFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    backgroundColor: 'rgb(241, 243, 248)',
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[14],
    borderBottomLeftRadius: theme.radii.lg,
    borderBottomRightRadius: theme.radii.lg,
  },
  coachFooterIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.md,
    color: theme.colors.accent,
    marginTop: -6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coachFooterText: {flex: 1},
  coachFooterTitle: {fontSize: theme.typography.fontSize.lg, fontWeight: '700', color: '#1A1A1A'},
  coachFooterSubtitle: {fontSize: theme.typography.fontSize.md, color: '#8E8E93', marginTop: 1},
  coachFooterChevron: {fontSize: 18, fontWeight: '700', color: theme.colors.accent},
  gaugeWrap: {width: GAUGE_SIZE, height: GAUGE_SIZE, justifyContent: 'center', alignItems: 'center'},
  gaugeLabel: {position: 'absolute', alignItems: 'center', justifyContent: 'center'},
  gaugeValRow: {flexDirection: 'row', alignItems: 'baseline'},
  gaugeVal: {fontSize: 32, fontWeight: '800', letterSpacing: -1.5, color: '#1A1A1A'},
  gaugeSuffix: {fontSize: theme.typography.fontSize.lg, fontWeight: '600', color: '#8E8E93', marginLeft: 1},
  gaugeCaption: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  profileInfo: {flex: 1, justifyContent: 'center'},
  profileTitle: {fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: theme.spacing[14], letterSpacing: -0.3},
  styleBars: {gap: theme.spacing[8]},
  sBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sBarLabel: {fontSize: theme.typography.fontSize.md, fontWeight: '500', color: '#8E8E93'},
  sBarVal: {fontSize: theme.typography.fontSize.lg, fontWeight: '800', color: '#1A1A1A'},
}));
