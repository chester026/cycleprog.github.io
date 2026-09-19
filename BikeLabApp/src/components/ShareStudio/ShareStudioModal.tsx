/**
 * ShareStudioModal - Main modal for creating and sharing ride images
 * Features:
 * - 6 template options (A: big distance, B: map centered, C: minimal, D: charts, E: brand3, F: journal)
 * - Background options (branded, gradient, transparent PNG, photo from gallery)
 * - Share to Stories / Save to Photos
 *
 * T-5.4: split out `TemplateCarousel` and `ExportBar`, and switched the
 * four background-type ternary branches to the single variant-driven
 * `BackgroundPicker`, to bring this file under 400 lines.
 */

import React, {useState, useRef, useCallback} from 'react';
import {View, Text, Modal, TouchableOpacity, ScrollView, Alert, useWindowDimensions} from 'react-native';
import {useTranslation} from 'react-i18next';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {TemplateA, TemplateB, TemplateC, TemplateD, TemplateE, TemplateF} from './templates';
import {BackgroundPicker, BackgroundPickerVariant} from './BackgroundPicker';
import {TemplateCarousel, TemplateType} from './TemplateCarousel';
import {MapStylePicker} from './MapStylePicker';
import {ExportBar} from './ExportBar';
import {launchImageLibrary} from 'react-native-image-picker';
import {
  ShareStudioProps,
  BackgroundType,
  MapStyle,
  TEMPLATE_WIDTH,
  TEMPLATE_HEIGHT,
} from './types';
import {logger} from '../../lib/logger';
import {makeStyles, withOpacity} from '../../theme';

// Templates B and F have their own background handling — B always shows a
// map/photo, F is a fixed journal background — so neither gets a picker.
const BACKGROUND_PICKER_VARIANT: Partial<Record<TemplateType, BackgroundPickerVariant>> = {
  A: 'bigStats',
  C: 'minimal',
  D: 'charts',
  E: 'simple',
};

export const ShareStudioModal: React.FC<ShareStudioProps> = ({
  visible,
  onClose,
  activity,
  trackCoordinates = [],
  streams,
}) => {
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
  const previewWidth = screenWidth - 160;
  const previewHeight = previewWidth * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('A');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('branded1');
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGrayscale, setIsGrayscale] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');

  const viewShotRef = useRef<ViewShot>(null);

  const handlePickMapPhoto = useCallback(async () => {
    try {
      const result = await launchImageLibrary({mediaType: 'photo', quality: 1});
      if (result.assets?.[0]?.uri) {
        setBackgroundType('photo');
        setBackgroundImage(result.assets[0].uri);
      }
    } catch (e) {
      logger.error('Image pick error:', e);
    }
  }, []);

  const captureImage = useCallback(async (): Promise<string | null> => {
    if (!viewShotRef.current) return null;
    try {
      const uri = await viewShotRef.current.capture?.();
      return uri || null;
    } catch (error) {
      logger.error('Error capturing image:', error);
      Alert.alert('Error', 'Failed to capture image');
      return null;
    }
  }, []);

  const handleShareToStories = async () => {
    setIsProcessing(true);
    try {
      const uri = await captureImage();
      if (!uri) {
        setIsProcessing(false);
        return;
      }

      try {
        await Share.shareSingle({
          backgroundImage: uri,
          social: Share.Social.INSTAGRAM_STORIES as any,
          appId: 'com.bikelab.app',
        });
      } catch {
        // Instagram not available or user cancelled, use generic share
        await Share.open({
          url: uri,
          type: backgroundType === 'transparent' ? 'image/png' : 'image/jpeg',
          message: `${activity.name} - ${(activity.distance / 1000).toFixed(1)}km 🚴`,
        });
      }
    } catch (error: any) {
      if (!error?.message?.includes('cancelled') && !error?.message?.includes('User did not share')) {
        logger.error('Share error:', error);
        Alert.alert(t('common.error'), t('shareStudio.captureError'));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToPhotos = async () => {
    setIsProcessing(true);
    try {
      const uri = await captureImage();
      if (!uri) {
        setIsProcessing(false);
        return;
      }

      await CameraRoll.saveAsset(uri, {type: 'photo', album: 'BikeLab'});
      Alert.alert('Saved!', 'Image saved to your photo library');
    } catch (error) {
      logger.error('Save error:', error);
      Alert.alert(t('common.error'), t('shareStudio.saveFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const renderTemplate = () => {
    const props = {activity, backgroundType, backgroundImage, trackCoordinates, streams, isGrayscale, mapStyle};

    switch (selectedTemplate) {
      case 'A':
        return <TemplateA {...props} />;
      case 'B':
        return <TemplateB {...props} />;
      case 'C':
        return <TemplateC {...props} />;
      case 'D':
        return <TemplateD {...props} />;
      case 'E':
        return <TemplateE {...props} />;
      case 'F':
        return <TemplateF {...props} />;
      default:
        return <TemplateA {...props} />;
    }
  };

  const backgroundPickerVariant = BACKGROUND_PICKER_VARIANT[selectedTemplate];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('shareStudio.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.previewContainer}>
          <View style={[styles.previewWrapper, {width: previewWidth, height: previewHeight}]}>
            <ViewShot
              ref={viewShotRef}
              options={{
                format: backgroundType === 'transparent' ? 'png' : 'jpg',
                quality: 1,
                result: 'tmpfile',
                width: TEMPLATE_WIDTH,
                height: TEMPLATE_HEIGHT,
              }}
              style={[styles.viewShot, {transform: [{scale: previewWidth / TEMPLATE_WIDTH}]}]}>
              {renderTemplate()}
            </ViewShot>
          </View>
          {/* Grayscale toggle - only visible when photo background */}
          {backgroundType === 'photo' && (
            <TouchableOpacity
              style={[styles.grayscaleToggle, isGrayscale && styles.grayscaleToggleActive]}
              onPress={() => setIsGrayscale(!isGrayscale)}
              activeOpacity={0.7}>
              <Text style={styles.grayscaleToggleText}>{t('shareStudio.bw')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <TemplateCarousel selectedTemplate={selectedTemplate} onSelect={setSelectedTemplate} />

          {/* Map style picker for template B */}
          {selectedTemplate === 'B' && (
            <MapStylePicker
              backgroundType={backgroundType}
              mapStyle={mapStyle}
              onSelectMapStyle={style => {
                setMapStyle(style);
                setBackgroundType('branded1');
              }}
              onPickPhoto={handlePickMapPhoto}
            />
          )}

          {/* Background Picker - different options per template */}
          {backgroundPickerVariant ? <View style={styles.section}>
              <BackgroundPicker
                variant={backgroundPickerVariant}
                selectedType={backgroundType}
                selectedImage={backgroundImage}
                onSelectType={setBackgroundType}
                onSelectImage={setBackgroundImage}
              />
            </View> : null}
        </ScrollView>

        <ExportBar
          isProcessing={isProcessing}
          onShareToStories={handleShareToStories}
          onSaveToPhotos={handleSaveToPhotos}
        />
      </View>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    // Pre-existing bug: missing closing paren on the rgba() string — kept
    // as-is (behaviour-preserving refactor, not a redesign).
    borderBottomColor: 'rgba(255, 255, 255, 0.3',
    backgroundColor: theme.colors.surface,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: theme.colors.text.inverse,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  previewContainer: {
    alignItems: 'center',
    padding: 12,
    // #222 has no theme token yet (see src/theme/README.md).
    backgroundColor: '#222',
  },
  previewWrapper: {
    backgroundColor: theme.colors.black,
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  viewShot: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    transformOrigin: 'top left',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  grayscaleToggle: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: withOpacity(theme.colors.black, 0.6),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withOpacity(theme.colors.text.inverse, 0.3),
  },
  grayscaleToggleActive: {
    backgroundColor: withOpacity(theme.colors.accent, 0.8),
    borderColor: theme.colors.accent,
  },
  grayscaleToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.inverse,
  },
}));

export default ShareStudioModal;
