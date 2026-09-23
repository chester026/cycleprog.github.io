/**
 * MapStylePicker - dark/light/photo background picker shown for Template B
 * only (it renders a map, not a branded image, so it doesn't use
 * `BackgroundPicker`). Extracted out of `ShareStudioModal.tsx` (T-5.4).
 */
import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useTranslation} from 'react-i18next';
import {BackgroundType, MapStyle} from './types';
import {makeStyles, withOpacity} from '../../theme';

interface MapStylePickerProps {
  backgroundType: BackgroundType;
  mapStyle: MapStyle;
  onSelectMapStyle: (style: MapStyle) => void;
  onPickPhoto: () => void;
}

export const MapStylePicker: React.FC<MapStylePickerProps> = ({
  backgroundType,
  mapStyle,
  onSelectMapStyle,
  onPickPhoto,
}) => {
  const {t} = useTranslation();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shareStudio.background')}</Text>
      <View style={styles.mapStyleRow}>
        <TouchableOpacity
          style={[styles.mapStyleOption, backgroundType !== 'photo' && mapStyle === 'dark' && styles.mapStyleOptionSelected]}
          onPress={() => onSelectMapStyle('dark')}
          activeOpacity={0.7}>
          <View style={[styles.mapStyleCircle, styles.mapStyleDarkCircle]} />
          <Text style={styles.mapStyleLabel}>{t('shareStudio.dark')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mapStyleOption, backgroundType !== 'photo' && mapStyle === 'light' && styles.mapStyleOptionSelected]}
          onPress={() => onSelectMapStyle('light')}
          activeOpacity={0.7}>
          <View style={[styles.mapStyleCircle, styles.mapStyleLightCircle]} />
          <Text style={styles.mapStyleLabel}>{t('shareStudio.light')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mapStyleOption, backgroundType === 'photo' && styles.mapStyleOptionSelected]}
          onPress={onPickPhoto}
          activeOpacity={0.7}>
          <View style={[styles.mapStyleCircle, styles.mapStylePhotoCircle]}>
            <Text style={styles.mapStylePlus}>+</Text>
          </View>
          <Text style={styles.mapStyleLabel}>{t('shareStudio.photo')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = makeStyles(theme => ({
  section: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mapStyleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  mapStyleOption: {
    width: 68,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  mapStyleOptionSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: withOpacity(theme.colors.accent, 0.08),
  },
  mapStyleCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  mapStyleDarkCircle: {
    backgroundColor: theme.colors.share.picker.mapDarkSwatch,
  },
  mapStyleLightCircle: {
    backgroundColor: theme.colors.borderLight,
  },
  mapStylePhotoCircle: {
    backgroundColor: theme.colors.share.picker.photoCircleBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapStylePlus: {
    fontSize: 18,
    fontWeight: '300',
    color: theme.colors.text.muted,
    marginTop: -1,
  },
  mapStyleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.share.picker.mutedLabel,
  },
}));
