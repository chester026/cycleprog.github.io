import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

interface TrainingDetails {
  name: string;
  trainingType?: string;
  recommendation?: string;
  details?: {
    intensity?: string;
    duration?: string;
    cadence?: string;
    hr_zones?: string;
    structure?: string[];
    benefits?: string[];
    technical_aspects?: string[];
    tips?: string[];
    common_mistakes?: string[];
  };
}

interface TrainingDetailsModalProps {
  visible: boolean;
  training: TrainingDetails | null;
  onClose: () => void;
}

export const TrainingDetailsModal: React.FC<TrainingDetailsModalProps> = ({
  visible,
  training,
  onClose,
}) => {
  if (!training) return null;

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
          <Text style={styles.headerTitle}>{training.name}</Text>
          <View style={{width: 40}} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Recommendation */}
          {training.recommendation && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Why This Training?</Text>
              <Text style={styles.text}>{training.recommendation}</Text>
            </View>
          )}

          {/* Basic Info */}
          {training.details && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key Parameters</Text>
              <View style={styles.infoGrid}>
                {training.details.intensity && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Intensity</Text>
                    <Text style={styles.infoValue}>{training.details.intensity}</Text>
                  </View>
                )}
                {training.details.duration && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Duration</Text>
                    <Text style={styles.infoValue}>{training.details.duration}</Text>
                  </View>
                )}
                {training.details.cadence && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Cadence</Text>
                    <Text style={styles.infoValue}>{training.details.cadence}</Text>
                  </View>
                )}
                {training.details.hr_zones && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>HR Zones</Text>
                    <Text style={styles.infoValue}>{training.details.hr_zones}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Structure */}
          {training.details?.structure && training.details.structure.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Training Structure</Text>
              {training.details.structure.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.listItemNumber}>{index + 1}.</Text>
                  <Text style={styles.listItemText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Benefits */}
          {training.details?.benefits && training.details.benefits.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Benefits</Text>
              {training.details.benefits.map((benefit, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bullet}>✓</Text>
                  <Text style={styles.listItemText}>{benefit}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Technical Aspects */}
          {training.details?.technical_aspects && training.details.technical_aspects.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Technical Aspects</Text>
              {training.details.technical_aspects.map((aspect, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.listItemText}>{aspect}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Tips */}
          {training.details?.tips && training.details.tips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💡 Tips</Text>
              {training.details.tips.map((tip, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bullet}>→</Text>
                  <Text style={styles.listItemText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Common Mistakes */}
          {training.details?.common_mistakes && training.details.common_mistakes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚠️ Common Mistakes</Text>
              {training.details.common_mistakes.map((mistake, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bullet}>✕</Text>
                  <Text style={styles.listItemText}>{mistake}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoItem: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    minWidth: '48%',
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingLeft: 4,
  },
  listItemNumber: {
    fontSize: 14,
    color: '#FF5E00',
    fontWeight: '700',
    marginRight: 8,
    minWidth: 20,
  },
  bullet: {
    fontSize: 14,
    color: '#FF5E00',
    fontWeight: '700',
    marginRight: 8,
    minWidth: 20,
  },
  listItemText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
    flex: 1,
  },
});
