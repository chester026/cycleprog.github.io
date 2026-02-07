/**
 * BackgroundPicker - Component for selecting template background
 * Options: Branded, Gradient, Transparent (PNG), Photo from gallery
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Image, ScrollView} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {launchImageLibrary} from 'react-native-image-picker';
import {BackgroundType, GRADIENTS} from './types';

// Branded backgrounds
const brandedBg1 = require('../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../assets/img/shareTemplates/template2.webp');

interface BackgroundPickerProps {
  selectedType: BackgroundType;
  selectedImage?: string;
  onSelectType: (type: BackgroundType) => void;
  onSelectImage: (uri: string) => void;
}

export const BackgroundPicker: React.FC<BackgroundPickerProps> = ({
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
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionsRow}
      >
        {/* Branded option 1 */}
        <TouchableOpacity
          style={[
            styles.option,
            selectedType === 'branded1' && styles.optionSelected,
          ]}
          onPress={() => onSelectType('branded1')}
          activeOpacity={0.7}
        >
          <Image
            source={brandedBg1}
            style={styles.optionPreview}
            resizeMode="cover"
          />
          <Text style={styles.optionLabel}>Brand 1</Text>
          {selectedType === 'branded1' && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Branded option 2 */}
        <TouchableOpacity
          style={[
            styles.option,
            selectedType === 'branded2' && styles.optionSelected,
          ]}
          onPress={() => onSelectType('branded2')}
          activeOpacity={0.7}
        >
          <Image
            source={brandedBg2}
            style={styles.optionPreview}
            resizeMode="cover"
          />
          <Text style={styles.optionLabel}>Brand 2</Text>
          {selectedType === 'branded2' && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Gradient option */}
        <TouchableOpacity
          style={[
            styles.option,
            selectedType === 'gradient' && styles.optionSelected,
          ]}
          onPress={() => onSelectType('gradient')}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={GRADIENTS.dark}
            style={styles.optionPreview}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
          />
          <Text style={styles.optionLabel}>Dark</Text>
          {selectedType === 'gradient' && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </TouchableOpacity>

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
      </ScrollView>
    </View>
  );
};

const PREVIEW_WIDTH = 70;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (9 / 9)); // ~124px

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
    backgroundColor: '#f1f0f0',
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  optionSelected: {
    borderColor: '#274dd3',
    backgroundColor: 'rgba(39, 77, 211, 0.05)',
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
    backgroundColor: '#fff',
  },
  checkerDark: {
    backgroundColor: '#e0e0e0',
  },
  photoPlaceholder: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    marginBottom: 6,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderIcon: {
    fontSize: 24,
  },
  optionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
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
