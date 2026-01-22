import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {apiFetch} from '../utils/api';
import {TrainingCard} from './TrainingCard';

interface TrainingType {
  key: string;
  name: string;
  intensity?: string;
  duration?: string;
  cadence?: string;
  hr_zones?: string;
  structure?: string[];
  benefits?: string[];
  technical_aspects?: string[];
  tips?: string[];
  common_mistakes?: string[];
}

interface TrainingLibraryModalProps {
  visible: boolean;
  onClose: () => void;
  onTrainingSelect: (training: any) => void;
}

export const TrainingLibraryModal: React.FC<TrainingLibraryModalProps> = ({
  visible,
  onClose,
  onTrainingSelect,
}) => {
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadTrainingTypes();
    }
  }, [visible]);

  const loadTrainingTypes = async () => {
    try {
      setLoading(true);
      const types = await apiFetch('/api/training-types');
      setTrainingTypes(types || []);
    } catch (err) {
      console.error('Error loading training types:', err);
      setError('Failed to load training types');
    } finally {
      setLoading(false);
    }
  };

  const handleTrainingPress = (training: TrainingType) => {
    onTrainingSelect({
      name: training.name,
      type: training.key,
      trainingType: training.key,
      recommendation: `${training.name} training`,
      details: {
        intensity: training.intensity,
        duration: training.duration,
        cadence: training.cadence,
        hr_zones: training.hr_zones,
        structure: training.structure,
        benefits: training.benefits,
        technical_aspects: training.technical_aspects,
        tips: training.tips,
        common_mistakes: training.common_mistakes,
      },
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Training Library</Text>
          <View style={{width: 40}} />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF5E00" />
            <Text style={styles.loadingText}>Loading trainings...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadTrainingTypes}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.description}>
              Explore our complete library of training types. Each workout is designed to help you achieve specific goals.
            </Text>

            <View style={styles.grid}>
              {trainingTypes.map((training, index) => (
                <TrainingCard
                  key={training.key}
                  title={training.name}
                  description={training.benefits?.[0] || ''}
                  intensity={training.intensity}
                  duration={training.duration}
                  trainingType={training.key}
                  size="small"
                  variant="priority"
                  onPress={() => handleTrainingPress(training)}
                  backgroundImage={
                    index % 4 === 0
                      ? require('../assets/img/blob1.png')
                      : index % 4 === 1
                      ? require('../assets/img/blob2.png')
                      : index % 4 === 2
                      ? require('../assets/img/blob3.png')
                      : require('../assets/img/blob4.png')
                  }
                />
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  description: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 20,
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#FF5E00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
