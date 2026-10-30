// The cheap text summary the activity list's "AI analysis" button already
// produces (GET /api/activities/:id/ai-analysis, cached server-side),
// brought onto the ride screen behind a "Show more" tap (owner, 30.10.2026).
// On demand only — the endpoint spends the rider's AI budget
// (useActivityAiAnalysis defaults to enabled: false for that reason).
import React, {useState} from 'react';
import {ActivityIndicator, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useActivityAiAnalysis} from '../../data/hooks/useActivityAiAnalysis';
import {makeStyles} from '../../theme';

interface AiSummaryProps {
  activityId: number | string;
}

export const AiSummary: React.FC<AiSummaryProps> = ({activityId}) => {
  const {t} = useTranslation();
  const [open, setOpen] = useState(false);
  const query = useActivityAiAnalysis(activityId, {enabled: open});

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('rideAnalytics.quickAnalysis')}</Text>
      <View style={styles.card}>
        {!open ? (
          <>
            <Text style={styles.teaser}>{t('rideAnalytics.quickAnalysisTeaser')}</Text>
            <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} testID="ai-summary-show-more">
              <Text style={styles.buttonText}>{t('rideAnalytics.showMore')}</Text>
            </TouchableOpacity>
          </>
        ) : query.isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.teaser}>{t('rideAnalytics.quickAnalysisLoading')}</Text>
          </View>
        ) : query.isError ? (
          <>
            <Text style={styles.teaser}>{t('rideAnalytics.quickAnalysisError')}</Text>
            <TouchableOpacity style={styles.button} onPress={() => query.refetch()}>
              <Text style={styles.buttonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.body} selectable>
            {query.data?.analysis}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {marginBottom: theme.spacing[24]},
  sectionTitle: {
    fontSize: theme.typography.fontSize.xxl,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: theme.spacing[8],
    marginTop: theme.spacing[8],
    paddingHorizontal: theme.spacing[16],
  },
  card: {
    marginHorizontal: theme.spacing[16],
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: theme.radii.lg,
    padding: theme.spacing[16],
    gap: theme.spacing[12],
  },
  teaser: {fontSize: theme.typography.fontSize.md, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 20, flex: 1},
  body: {fontSize: theme.typography.fontSize.base, color: 'rgba(255, 255, 255, 0.9)', lineHeight: 22},
  loadingRow: {flexDirection: 'row', alignItems: 'center', gap: theme.spacing[12]},
  button: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[14],
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  buttonText: {fontSize: theme.typography.fontSize.sm, fontWeight: '800', color: theme.colors.text.inverse},
}));
