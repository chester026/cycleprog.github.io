// Preview strip of up to 6 achievements (recently unlocked + closest to
// unlocking) with a "view all" link to the full Achievements screen.
// Extracted from GarageScreen.tsx (T-5.4, audit A-27). Renders nothing
// when there are no achievements to show, same as before.
import React from 'react';
import {View, Text, ScrollView, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {AchievementMiniCard, type Achievement} from '../../components/achievements';
import {useAppNavigation} from '../../navigation/hooks';
import {makeStyles} from '../../theme';
import {GarageSectionTitle} from './GarageSectionTitle';

export interface AchievementsPreviewProps {
  achievements: Achievement[];
}

export const AchievementsPreview: React.FC<AchievementsPreviewProps> = ({achievements}) => {
  const {t} = useTranslation();
  const navigation = useAppNavigation();

  if (achievements.length === 0) return null;

  return (
    <View style={styles.achievementsSection}>
      <View style={styles.achievementsSectionHeader}>
        <GarageSectionTitle title={t('garage.achieves')} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.achievementsGridContent}
        style={styles.achievementsGrid}>
        {achievements.map(achievement => (
          <AchievementMiniCard key={achievement.id} achievement={achievement} />
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.viewAllButton} onPress={() => navigation.navigate('Achievements')}>
        <Text style={styles.viewAllButtonText}>{t('garage.viewAll')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = makeStyles(theme => ({
  achievementsSection: {
    marginTop: theme.spacing[16],
    marginBottom: theme.spacing[24],
  },
  achievementsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: theme.spacing[16],
    padding: theme.spacing[16],
  },
  viewAllButton: {
    flex: 1,
    backgroundColor: theme.colors.speedWidget.cardBg,
    padding: theme.spacing[16],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing[16],
    width: 115,
    marginTop: theme.spacing[8],
  },
  viewAllButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.primary,
  },
  achievementsGrid: {
    marginBottom: 0,
  },
  achievementsGridContent: {
    flexDirection: 'row',
    gap: 0,
    paddingHorizontal: 0,
  },
}));
