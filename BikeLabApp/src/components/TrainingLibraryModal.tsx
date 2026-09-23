import React from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme, withOpacity} from '../theme';
import type {TrainingType} from '@bikelab/shared/types';
import {useTrainingTypes} from '../data/hooks/useTrainingTypes';
import {TrainingCard} from './TrainingCard';
import type {TrainingDetails} from './TrainingDetailsModal';

interface TrainingLibraryModalProps {
  visible: boolean;
  onClose: () => void;
  onTrainingSelect: (training: TrainingDetails) => void;
}

export const TrainingLibraryModal: React.FC<TrainingLibraryModalProps> = ({
  visible,
  onClose,
  onTrainingSelect,
}) => {
  const {t} = useTranslation();
  const theme = useTheme();
  // Only fetch while the modal is actually open (T-5.4) — same
  // GET /api/training-types query as GoalDetails/TrainingsTab.tsx shares
  // its cache entry with, so opening this after that tab has already
  // loaded is instant.
  const {data: trainingTypes = [], isLoading: loading, isError, refetch} = useTrainingTypes(visible);
  const error = isError ? t('training.libraryFailed') : null;

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
        // `structure` on the wire is an array for these entries (the
        // object-with-warmup/main/cooldown shape only shows up on
        // AI-generated trainings — see GoalDetails/lib.ts groupTrainings);
        // TrainingTypeSchema types it as a permissive record either way.
        structure: Array.isArray(training.structure) ? (training.structure as string[]) : undefined,
        benefits: training.benefits,
        technical_aspects: training.technical_aspects,
        // `.passthrough()` fields not in the pinned-down TS shape — see
        // GoalDetails/lib.ts's identical `extra` cast.
        tips: (training as unknown as {tips?: string[]}).tips,
        common_mistakes: (training as unknown as {common_mistakes?: string[]}).common_mistakes,
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
            <Text style={styles.closeButtonText}>{t('common.close')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('training.libraryTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.chart.series3} />
            <Text style={styles.loadingText}>{t('training.libraryLoading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
              <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.description}>
              {t('training.libraryHint')}
            </Text>

            <View style={styles.grid}>
              {trainingTypes.map((training, index) => (
                <TrainingCard
                  key={training.key ?? index}
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

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  closeButtonText: {
    fontSize: 24,
    color: theme.colors.text.inverse,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.inverse,
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
    color: withOpacity(theme.colors.text.inverse, 0.7),
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
    color: withOpacity(theme.colors.text.inverse, 0.7),
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
    color: theme.colors.danger,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.colors.chart.series3,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: 14,
    fontWeight: '600',
  },
}));
