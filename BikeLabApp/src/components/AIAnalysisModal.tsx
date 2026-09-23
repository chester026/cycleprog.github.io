import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {api, activities} from '../data/api';
import {logger} from '../lib/logger';
import {makeStyles, useTheme} from '../theme';

interface AIAnalysisModalProps {
  visible: boolean;
  activityId: number | null;
  activityName: string;
  onClose: () => void;
}

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  visible,
  activityId,
  activityName,
  onClose,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && activityId) {
      loadAnalysis();
    }
    // loadAnalysis is redefined every render (reads activityId/visible from
    // closure) — including it here would re-run this effect on every
    // render; visible/activityId are the actual trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, activityId]);

  const loadAnalysis = async () => {
    if (!activityId) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await api.call(activities.aiAnalysis, {params: {id: activityId}});
      setAnalysis(response.analysis);
    } catch (err: any) {
      logger.error('AI Analysis error:', err);
      setError(err.message || t('aiAnalysis.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAnalysis(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
           
            <View>
              <Text style={styles.title}> {activityName}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {t('aiAnalysis.title')}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {loading ? <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
              <Text style={styles.loadingText}>{t('aiAnalysis.analyzing')}</Text>
            </View> : null}

          {error ? <View style={styles.errorContainer}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadAnalysis}>
                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View> : null}

          {analysis && !loading ? <View style={styles.analysisContainer}>
              <Text style={styles.analysisText}>{analysis}</Text>
            </View> : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderDark,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
    gap: 12,
  },
 
  aiEmoji: {
    fontSize: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.text.muted,
    marginTop: 2,
    marginLeft: 4
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: theme.colors.text.muted,
    fontWeight: '300',
  },
  content: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: theme.colors.text.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.aiAnalysis.errorText,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: 16,
    fontWeight: '600',
  },
  analysisContainer: {
    padding: 20,
  },
  analysisText: {
    fontSize: 15,
    lineHeight: 24,
    color: theme.colors.borderLight,
  },
}));

