import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {apiFetch} from '../utils/api';

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
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && activityId) {
      loadAnalysis();
    }
  }, [visible, activityId]);

  const loadAnalysis = async () => {
    if (!activityId) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await apiFetch(`/api/activities/${activityId}/ai-analysis`);
      setAnalysis(response.analysis);
    } catch (err: any) {
      console.error('AI Analysis error:', err);
      setError(err.message || 'Failed to load AI analysis');
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
                AI-Analysis
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {loading && (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#274dd3" />
              <Text style={styles.loadingText}>Analyzing your ride...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadAnalysis}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {analysis && !loading && (
            <View style={styles.analysisContainer}>
              <Text style={styles.analysisText}>{analysis}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
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
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
    marginLeft: 4
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#888',
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
    color: '#888',
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
    color: '#ff5e5e',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#274dd3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  analysisContainer: {
    padding: 20,
  },
  analysisText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#e0e0e0',
  },
});

