/**
 * BackgroundPickerSimple - Simplified background picker for Template E
 * Only two options: Transparent (PNG) or Photo from gallery
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Image} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {BackgroundType} from './types';

interface BackgroundPickerSimpleProps {
  selectedType: BackgroundType;
  selectedImage?: string;
  onSelectType: (type: BackgroundType) => void;
  onSelectImage: (uri: string) => void;
}

export const BackgroundPickerSimple: React.FC<BackgroundPickerSimpleProps> = ({
  selectedType,
  selectedImage,
  onSelectType,
  onSelectImage,
}) => {
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
      <Text style={styles.title}>Background</Text>
      
      <View style={styles.optionsRow}>
        {/* Transparent option */}
        <TouchableOpacity
          style={[
            styles.option,
            selectedType === 'transparent' && styles.optionSelected,
          ]}
          onPress={() => onSelectType('transparent')}
          activeOpacity={0.7}
        >
          <View style={styles.transparentPreview}>
            <View style={styles.checkerboard}>
              {[...Array(16)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.checkerSquare,
                    (Math.floor(i / 4) + (i % 4)) % 2 === 0 && styles.checkerDark,
                  ]}
                />
              ))}
            </View>
          </View>
          <Text style={styles.optionLabel}>PNG</Text>
          {selectedType === 'transparent' && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Photo option */}
        <TouchableOpacity
          style={[
            styles.option,
            selectedType === 'photo' && styles.optionSelected,
          ]}
          onPress={handlePickImage}
          activeOpacity={0.7}
        >
          {selectedImage ? (
            <Image
              source={{uri: selectedImage}}
              style={styles.optionPreview}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderIcon}>📷</Text>
            </View>
          )}
          <Text style={styles.optionLabel}>Photo</Text>
          {selectedType === 'photo' && selectedImage && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const PREVIEW_WIDTH = 70;
const PREVIEW_HEIGHT = 70;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
  },
  option: {
    width: PREVIEW_WIDTH,
    alignItems: 'center',
    padding: 0,
    paddingBottom: 8,
    backgroundColor: '#2d2d2d',
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  optionSelected: {
    borderColor: '#274dd3',
    backgroundColor: 'rgba(39, 77, 211, 0.1)',
  },
  optionPreview: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    marginBottom: 6,
  },
  transparentPreview: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    marginBottom: 6,
    overflow: 'hidden',
  },
  checkerboard: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkerSquare: {
    width: '25%',
    height: '12.5%',
    backgroundColor: '#444',
  },
  checkerDark: {
    backgroundColor: '#333',
  },
  photoPlaceholder: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    marginBottom: 6,
    backgroundColor: '#3a3a3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderIcon: {
    fontSize: 24,
  },
  optionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  checkmark: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 0,
    backgroundColor: '#274dd3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
