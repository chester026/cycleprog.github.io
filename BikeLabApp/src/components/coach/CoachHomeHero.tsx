import React, {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {Text, View} from 'react-native';
import {useProfile} from '../../data/hooks/useProfile';
import {makeStyles} from '../../theme';

// Greeting + headline for the top of the AI Coach home (the coach.headerTitle
// tab's list view) — first thing the rider sees above the prompt input and
// "Recent chats". Previously also carried a "last 4 weeks" stats row, but the
// redesigned home screen (greeting -> headline -> caption -> prompt input ->
// quick-start chips -> recent chats) has no room/need for it — that data is
// still one tap away in the Analysis tab.
//
// T-5.x wave 2: reads the shared TanStack `useProfile()` cache instead of
// the deprecated `useAppData().loadUserProfile()` shim — no behaviour
// change, this screen never triggered its own profile fetch anyway (every
// other screen sharing the same cache already keeps it warm).
export const CoachHomeHero: React.FC = () => {
  const {t} = useTranslation();
  const {data: profile} = useProfile();

  const firstName = useMemo(() => {
    const first = (profile as any)?.name?.trim().split(/\s+/)[0];
    return first || t('coach.greetingFallbackName');
  }, [profile, t]);

  return (
    <View style={styles.container}>
      {/* One flowing headline — "Hey {name} <question>" — rather than a
          separate small greeting line above a separate big question. Matches
          the original hero's single-sentence treatment (name highlighted
          inline, same size as the surrounding text) instead of splitting the
          name out into its own smaller line. */}
      <Text style={styles.headline}>
        {t('coach.homeGreetingBefore')}
        <Text style={styles.greetingName}> {firstName} </Text>
        {t('coach.homeHeadline')}
      </Text>
      <Text style={styles.subtitle}>{t('coach.homeSubtitle')}</Text>
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    paddingHorizontal: theme.spacing[20],
    paddingTop: theme.spacing[16],
    paddingBottom: theme.spacing[16],
  },
  greetingName: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    color: theme.colors.accent,
    fontWeight: '800',
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.colors.text.primary,
    lineHeight: 36,
    marginBottom: theme.spacing[10],
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 20,
    marginBottom: theme.spacing[8],
  },
}));
