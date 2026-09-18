// Extracted from AnalysisScreen.tsx (T-5.4 screen decomposition). Thin
// wrapper around SkillsRadarChart so the screen file doesn't need to know
// the container styling or the "only once activities exist" guard.
import React from 'react';
import {View} from 'react-native';
import SkillsRadarChart from '../../components/SkillsRadarChart';
import type {Skills, RiderProfile} from '../../components/SkillsRadarChart';
import {makeStyles} from '../../theme';

interface SkillsSectionProps {
  skills: Skills | null;
  riderProfile: RiderProfile | null;
  skillsTrend?: Record<string, number | null> | null;
  onHelpPress: (topicId: string) => void;
}

export const SkillsSection: React.FC<SkillsSectionProps> = ({
  skills,
  riderProfile,
  skillsTrend,
  onHelpPress,
}) => (
  <View style={styles.chartsContainer}>
    <SkillsRadarChart
      skills={skills}
      riderProfile={riderProfile}
      skillsTrend={skillsTrend}
      onHelpPress={onHelpPress}
    />
  </View>
);

const styles = makeStyles(theme => ({
  chartsContainer: {
    backgroundColor: theme.colors.surface,
  },
}));
