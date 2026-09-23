/**
 * TemplateCarousel - horizontal template picker strip, extracted out of
 * `ShareStudioModal.tsx` (T-5.4) to keep the modal under 400 lines.
 */
import React from 'react';
import {View, Text, TouchableOpacity, ScrollView} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, withOpacity} from '../../theme';

export type TemplateType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  A: 'Big Stats',
  B: 'Map',
  C: 'Minimal',
  D: 'Charts',
  E: 'Brand 3',
  F: 'Journal',
};

const TEMPLATE_TYPES: TemplateType[] = ['A', 'B', 'C', 'D', 'E', 'F'];

interface TemplateCarouselProps {
  selectedTemplate: TemplateType;
  onSelect: (template: TemplateType) => void;
}

export const TemplateCarousel: React.FC<TemplateCarouselProps> = ({selectedTemplate, onSelect}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.templateSelector}>
      <Text style={styles.sectionTitle}>{t('shareStudio.template')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateOptions}>
        {TEMPLATE_TYPES.map(template => (
          <TouchableOpacity
            key={template}
            style={[styles.templateOption, selectedTemplate === template && styles.templateOptionSelected]}
            onPress={() => onSelect(template)}
            activeOpacity={0.7}>
            <View style={styles.templateThumbnail}>
              <Text style={styles.templateLabel}>{TEMPLATE_LABELS[template]}</Text>
            </View>
            {selectedTemplate === template && (
              <View style={styles.templateCheck}>
                <Text style={styles.templateCheckText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  templateSelector: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  templateOptions: {
    gap: 4,
  },
  templateOption: {
    width: 100,
    alignItems: 'center',
    padding: 0,
    backgroundColor: theme.colors.share.carouselOptionBg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateOptionSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: withOpacity(theme.colors.accent, 0.05),
  },
  templateThumbnail: {
    width: '100%',
    aspectRatio: 12 / 8,
    backgroundColor: theme.colors.surfaceDarkAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  templateLabel: {
    fontSize: 11,
    color: theme.colors.text.inverse,
    fontWeight: '600',
    textAlign: 'center',
  },
  templateCheck: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 0,
    backgroundColor: theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateCheckText: {
    color: theme.colors.text.inverse,
    fontSize: 12,
    fontWeight: '700',
  },
}));
