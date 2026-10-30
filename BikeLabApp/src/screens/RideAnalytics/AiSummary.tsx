// The cheap text summary the activity list's "AI analysis" button already
// produces (GET /api/activities/:id/ai-analysis, cached server-side),
// brought onto the ride screen behind a "Show more" tap (owner, 30.10.2026).
// On demand only — the endpoint spends the rider's AI budget
// (useActivityAiAnalysis defaults to enabled: false for that reason).
import React, {useState} from 'react';
import {ActivityIndicator, Text, TouchableOpacity, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {useActivityAiAnalysis} from '../../data/hooks/useActivityAiAnalysis';
import {AIAnalysisModal} from '../../components/AIAnalysisModal';
import {makeStyles} from '../../theme';

interface AiSummaryProps {
  activityId: number | string;
  activityName: string;
}

// How much of the generated text the card shows inline; the rest is one
// tap away in the same modal the activity list uses (owner, 30.10.2026).
const PREVIEW_PARAGRAPHS = 2;

/** First N paragraphs (blank-line separated, falling back to lines) and whether anything was cut. */
export function previewOf(text: string, paragraphs = PREVIEW_PARAGRAPHS): {preview: string; truncated: boolean} {
  const blocks = text
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(Boolean);
  const units = blocks.length > 1 ? blocks : text.split('\n').map(l => l.trim()).filter(Boolean);
  const kept = units.slice(0, paragraphs);
  return {preview: kept.join('\n\n'), truncated: units.length > kept.length};
}

export const AiSummary: React.FC<AiSummaryProps> = ({activityId, activityName}) => {
  const {t} = useTranslation();
  const [open, setOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const query = useActivityAiAnalysis(activityId, {enabled: open});
  // A disabled query still returns what the cache holds — so a summary
  // generated earlier (this screen, or the list's modal) shows at once on
  // re-entry instead of the teaser again (owner, 30.10.2026).
  const full = query.data?.analysis ?? '';
  const hasText = full.length > 0;
  const {preview, truncated} = previewOf(full);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('rideAnalytics.quickAnalysis')}</Text>
      <View style={styles.card}>
        {!open && !hasText ? (
          <>
            <Text style={styles.teaser}>{t('rideAnalytics.quickAnalysisTeaser')}</Text>
            <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} testID="ai-summary-show-more">
              <Text style={styles.buttonText}>{t('rideAnalytics.showMore')}</Text>
            </TouchableOpacity>
          </>
        ) : query.isLoading && !hasText ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.teaser}>{t('rideAnalytics.quickAnalysisLoading')}</Text>
          </View>
        ) : query.isError && !hasText ? (
          <>
            <Text style={styles.teaser}>{t('rideAnalytics.quickAnalysisError')}</Text>
            <TouchableOpacity style={styles.button} onPress={() => query.refetch()}>
              <Text style={styles.buttonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setModalVisible(true)} testID="ai-summary-text">
              <Text style={styles.body}>{preview}</Text>
            </TouchableOpacity>
            {truncated ? (
              <TouchableOpacity style={styles.button} onPress={() => setModalVisible(true)} testID="ai-summary-open-full">
                <Text style={styles.buttonText}>{t('rideAnalytics.showMore')}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>
      {/* The same modal the activity list opens from its "AI analysis"
          button. It fetches on its own, but the server answers from the
          per-summary cache (aiAnalysis.js) — no second model call. */}
      <AIAnalysisModal
        visible={modalVisible}
        activityId={Number(activityId)}
        activityName={activityName}
        onClose={() => setModalVisible(false)}
      />
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
