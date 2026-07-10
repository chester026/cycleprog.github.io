import React, {useEffect, useMemo, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {StyleSheet, Text, View} from 'react-native';
import {useAppData} from '../../contexts/AppDataContext';

// Greeting + headline for the top of the AI Coach home (the coach.headerTitle
// tab's list view) — first thing the rider sees above the prompt input and
// "Recent chats". Previously also carried a "last 4 weeks" stats row, but the
// redesigned home screen (greeting -> headline -> caption -> prompt input ->
// quick-start chips -> recent chats) has no room/need for it — that data is
// still one tap away in the Analysis tab.
export const CoachHomeHero: React.FC = () => {
  const {t} = useTranslation();
  const {loadUserProfile} = useAppData();
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    loadUserProfile()
      .then(p => setProfileName((p as any)?.name || null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = useMemo(() => {
    const first = profileName?.trim().split(/\s+/)[0];
    return first || t('coach.greetingFallbackName');
  }, [profileName, t]);

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

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
   
  },
  greetingName: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    color: '#274dd3',
    fontWeight: '800',
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: 36,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.5)',
    lineHeight: 20,
    marginBottom: 8,
  },
});
