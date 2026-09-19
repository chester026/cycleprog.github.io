// "Ask coach about your checklist" banner — same light-blue full-width
// banner + sparkle + chevron language as BikeGarage/OverviewCard.tsx's
// coach footer (owner request: redesign Checklist in BikeGarage's visual
// language). Rendered as the bottom edge of ChecklistOverviewCard, so only
// its bottom corners are rounded and it carries no outer margin — the card
// above owns the chrome.
import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {SparkleIcon} from '../../assets/img/icons/SparkleIcon';
import {makeStyles} from '../../theme';

export interface ChecklistCoachBannerProps {
  onPress: () => void;
}

export const ChecklistCoachBanner: React.FC<ChecklistCoachBannerProps> = ({onPress}) => {
  const {t} = useTranslation();
  return (
    <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.icon}>
        <SparkleIcon size={32} color="#274dd3" />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{t('checklist.askCoach')}</Text>
        <Text style={styles.subtitle}>{t('checklist.askCoachSubtitle')}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
};

const styles = makeStyles(theme => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[8],
    backgroundColor: 'rgb(241, 243, 248)',
    paddingHorizontal: theme.spacing[20],
    paddingVertical: theme.spacing[14],
    borderBottomLeftRadius: theme.radii.lg,
    borderBottomRightRadius: theme.radii.lg,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.md,
    marginTop: -6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {flex: 1},
  title: {fontSize: theme.typography.fontSize.lg, fontWeight: '700', color: '#1A1A1A'},
  subtitle: {fontSize: theme.typography.fontSize.md, color: '#8E8E93', marginTop: 1},
  chevron: {fontSize: 18, fontWeight: '700', color: theme.colors.accent},
}));
