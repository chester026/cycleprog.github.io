/**
 * BackgroundPickerCharts - Background picker for Charts template (D)
 * Options: Brand 1, Brand 5, Brand 2, Transparent (PNG), Photo from gallery
 */

import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Image, ScrollView} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {BackgroundType} from './types';

const brandedBg1 = require('../../assets/img/shareTemplates/template1.webp');
const brandedBg2 = require('../../assets/img/shareTemplates/template2.webp');
const brandedBg5 = require('../../assets/img/shareTemplates/template5.webp');

interface BackgroundPickerChartsProps {
  selectedType: BackgroundType;
  selectedImage?: string;
  onSelectType: (type: BackgroundType) => void;
  onSelectImage: (uri: string) => void;
}

export const BackgroundPickerCharts: React.FC<BackgroundPickerChartsProps> = ({
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
        contentContainerStyle={styles.optionsRow}>
        <TouchableOpacity
          style={[styles.option, selectedType === 'branded1' && styles.optionSelected]}
          onPress={() => onSelectType('branded1')}
          activeOpacity={0.7}>
          <Image source={brandedBg1} style={styles.circle} resizeMode="cover" />
          <Text style={styles.optionLabel}>Brand 1</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, selectedType === 'branded5' && styles.optionSelected]}
          onPress={() => onSelectType('branded5')}
          activeOpacity={0.7}>
          <Image source={brandedBg5} style={styles.circle} resizeMode="cover" />
          <Text style={styles.optionLabel}>Brand 5</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, selectedType === 'branded2' && styles.optionSelected]}
          onPress={() => onSelectType('branded2')}
          activeOpacity={0.7}>
          <Image source={brandedBg2} style={styles.circle} resizeMode="cover" />
          <Text style={styles.optionLabel}>Brand 2</Text>
        </TouchableOpacity>

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
                  (Math.floor(i / 4) + (i % 4)) % 2 === 0 && styles.checkerDark,
                ]}
              />
            ))}
          </View>
          <Text style={styles.optionLabel}>PNG</Text>
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
          <Text style={styles.optionLabel}>Photo</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const CIRCLE = 36;

const styles = StyleSheet.create({
  container: {
    paddingVertical: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
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
    borderColor: '#274dd3',
    backgroundColor: 'rgba(39, 77, 211, 0.1)',
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
    backgroundColor: '#fff',
  },
  checkerSquare: {
    width: '25%',
    height: '25%',
    backgroundColor: '#fff',
  },
  checkerDark: {
    backgroundColor: '#ccc',
  },
  photoCircle: {
    backgroundColor: '#3a3a3a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusIcon: {
    fontSize: 18,
    fontWeight: '300',
    color: '#888',
    marginTop: -1,
  },
  optionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999',
  },
});
