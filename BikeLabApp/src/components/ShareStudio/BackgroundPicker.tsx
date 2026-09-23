/**
 * BackgroundPicker - background-option strip shown below the template
 * preview in Share Studio.
 *
 * T-5.4: replaces four near-identical copies (`BackgroundPickerBigStats`
 * for template A, `BackgroundPickerCharts` for D, `BackgroundPickerMinimal`
 * for C, `BackgroundPickerSimple` for E) that only differed in which
 * `BackgroundType` options they offered, their label text, and (Simple
 * only) a darker checkerboard tint. Those differences now live in
 * `VARIANT_CONFIG` below; a fifth, unrelated (and unused/unexported)
 * `BackgroundPicker` design — a rectangular-preview picker with a
 * checkmark badge, never wired into `ShareStudioModal` — was dead code and
 * is removed rather than folded in as a variant.
 */

import React from 'react';
import {View, Text, TouchableOpacity, Image, ScrollView} from 'react-native';
import {useTranslation} from 'react-i18next';
import {launchImageLibrary} from 'react-native-image-picker';
import {BackgroundType} from './types';
import {makeStyles, withOpacity} from '../../theme';

const brandedBg1 = require('../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../assets/img/shareTemplates/template2.webp');
const brandedBg5 = require('../../assets/img/shareTemplates/template5.webp');

export type BackgroundPickerVariant = 'bigStats' | 'charts' | 'minimal' | 'simple';

interface BrandOption {
  type: BackgroundType;
  source: ReturnType<typeof require>;
  labelKey: string;
}

interface VariantConfig {
  /** Branded-image options shown before the transparent/photo ones. */
  brandOptions: BrandOption[];
  /** Darker checkerboard tint (Simple/template E is the one dark variant). */
  darkCheckerboard: boolean;
}

const VARIANT_CONFIG: Record<BackgroundPickerVariant, VariantConfig> = {
  // Template A (Big Stats): Brand 1, Transparent, Photo
  bigStats: {
    brandOptions: [{type: 'branded1', source: brandedBg1, labelKey: 'shareStudio.brand1'}],
    darkCheckerboard: false,
  },
  // Template D (Charts): Brand 1, Brand 5, Brand 2, Transparent, Photo
  charts: {
    brandOptions: [
      {type: 'branded1', source: brandedBg1, labelKey: 'shareStudio.brand1'},
      {type: 'branded5', source: brandedBg5, labelKey: 'shareStudio.brand5'},
      {type: 'branded2', source: brandedBg2, labelKey: 'shareStudio.brand2'},
    ],
    darkCheckerboard: false,
  },
  // Template C (Minimal): Brand 2, Transparent, Photo (under mask)
  minimal: {
    brandOptions: [{type: 'branded2', source: brandedBg2, labelKey: 'shareStudio.brand2'}],
    darkCheckerboard: false,
  },
  // Template E (Brand 3): Transparent, Photo (mask overlay) — no brand option
  simple: {
    brandOptions: [],
    darkCheckerboard: true,
  },
};

interface BackgroundPickerProps {
  variant: BackgroundPickerVariant;
  selectedType: BackgroundType;
  selectedImage?: string;
  onSelectType: (type: BackgroundType) => void;
  onSelectImage: (uri: string) => void;
}

const CIRCLE = 36;

export const BackgroundPicker: React.FC<BackgroundPickerProps> = ({
  variant,
  selectedType,
  selectedImage,
  onSelectType,
  onSelectImage,
}) => {
  const {t} = useTranslation();
  const config = VARIANT_CONFIG[variant];

  const handlePickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 1,
      selectionLimit: 1,
      maxWidth: 2048,
      maxHeight: 2048,
    });

    if (result.assets && result.assets[0]?.uri) {
      onSelectImage(result.assets[0].uri);
      onSelectType('photo');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('shareStudio.background')}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionsRow}>
        {config.brandOptions.map(option => (
          <TouchableOpacity
            key={option.type}
            style={[styles.option, selectedType === option.type && styles.optionSelected]}
            onPress={() => onSelectType(option.type)}
            activeOpacity={0.7}>
            <Image source={option.source} style={styles.circle} resizeMode="cover" />
            <Text style={styles.optionLabel}>{t(option.labelKey)}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.option, selectedType === 'transparent' && styles.optionSelected]}
          onPress={() => onSelectType('transparent')}
          activeOpacity={0.7}>
          <View style={[styles.circle, styles.checkerCircle]}>
            {[...Array(16)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.checkerSquare,
                  config.darkCheckerboard && styles.checkerSquareDark,
                  (Math.floor(i / 4) + (i % 4)) % 2 === 0 &&
                    (config.darkCheckerboard ? styles.checkerDarkVariantDark : styles.checkerDark),
                ]}
              />
            ))}
          </View>
          <Text style={styles.optionLabel}>{t('shareStudio.png')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, selectedType === 'photo' && styles.optionSelected]}
          onPress={handlePickImage}
          activeOpacity={0.7}>
          {selectedImage ? (
            <Image source={{uri: selectedImage}} style={styles.circle} resizeMode="cover" />
          ) : (
            <View style={[styles.circle, styles.photoCircle]}>
              <Text style={styles.plusIcon}>+</Text>
            </View>
          )}
          <Text style={styles.optionLabel}>{t('shareStudio.photo')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = makeStyles(theme => ({
  container: {
    paddingVertical: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  option: {
    width: 68,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  optionSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: withOpacity(theme.colors.accent, 0.1),
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: 'hidden',
  },
  checkerCircle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.surfaceElevated,
  },
  checkerSquare: {
    width: '25%',
    height: '25%',
    backgroundColor: theme.colors.surfaceElevated,
  },
  checkerSquareDark: {
    backgroundColor: theme.colors.share.picker.checkerDark,
  },
  checkerDark: {
    backgroundColor: theme.colors.share.picker.checkerLight,
  },
  checkerDarkVariantDark: {
    backgroundColor: theme.colors.icon.dark,
  },
  photoCircle: {
    backgroundColor: theme.colors.share.picker.photoCircleBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusIcon: {
    fontSize: 18,
    fontWeight: '300',
    color: theme.colors.text.muted,
    marginTop: -1,
  },
  optionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.share.picker.mutedLabel,
  },
}));

export default BackgroundPicker;
