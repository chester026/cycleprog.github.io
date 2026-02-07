/**
 * ShareStudioModal - Main modal for creating and sharing ride images
 * Features:
 * - 4 template options (A: big distance, B: map centered, C: minimal, D: charts)
 * - Background options (gradient, transparent PNG, photo from gallery)
 * - Share to Stories / Save to Photos
 */

import React, {useState, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {TemplateA, TemplateB, TemplateC, TemplateD, TemplateE, TemplateF} from './templates';
import {BackgroundPickerSimple} from './BackgroundPickerSimple';
import {BackgroundPickerBigStats} from './BackgroundPickerBigStats';
import {BackgroundPickerMinimal} from './BackgroundPickerMinimal';
import {BackgroundPickerCharts} from './BackgroundPickerCharts';
import {
  ShareStudioProps,
  BackgroundType,
  TEMPLATE_WIDTH,
  TEMPLATE_HEIGHT,
  SCALE_FACTOR,
} from './types';

type TemplateType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

const {width: screenWidth} = Dimensions.get('window');
const PREVIEW_WIDTH = screenWidth - 160;
const PREVIEW_HEIGHT = PREVIEW_WIDTH * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH);

export const ShareStudioModal: React.FC<ShareStudioProps> = ({
  visible,
  onClose,
  activity,
  trackCoordinates = [],
  streams,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('A');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('branded1');
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGrayscale, setIsGrayscale] = useState(false);
  
  const viewShotRef = useRef<ViewShot>(null);

  // Capture template as image
  const captureImage = useCallback(async (): Promise<string | null> => {
    if (!viewShotRef.current) return null;
    
    try {
      const uri = await viewShotRef.current.capture?.();
      return uri || null;
    } catch (error) {
      console.error('Error capturing image:', error);
      Alert.alert('Error', 'Failed to capture image');
      return null;
    }
  }, []);

  // Share to Stories (Instagram, Snapchat, etc.)
  const handleShareToStories = async () => {
    setIsProcessing(true);
    
    try {
      const uri = await captureImage();
      if (!uri) {
        setIsProcessing(false);
        return;
      }

      // Try Instagram Stories first, fallback to generic share
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
        console.error('Share error:', error);
        Alert.alert('Error', 'Failed to share image');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Save to Photos
  const handleSaveToPhotos = async () => {
    setIsProcessing(true);
    
    try {
      const uri = await captureImage();
      if (!uri) {
        setIsProcessing(false);
        return;
      }

      await CameraRoll.saveAsset(uri, {
        type: 'photo',
        album: 'BikeLab',
      });

      Alert.alert('Saved!', 'Image saved to your photo library');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save image. Please check photo permissions.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Render current template
  const renderTemplate = () => {
    const props = {
      activity,
      backgroundType,
      backgroundImage,
      trackCoordinates,
      streams,
      isGrayscale,
    };

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

  // Template selector
  const renderTemplateSelector = () => (
    <View style={styles.templateSelector}>
      <Text style={styles.sectionTitle}>Template</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.templateOptions}
      >
        {(['A', 'B', 'C', 'D', 'E', 'F'] as TemplateType[]).map((template) => (
          <TouchableOpacity
            key={template}
            style={[
              styles.templateOption,
              selectedTemplate === template && styles.templateOptionSelected,
            ]}
            onPress={() => setSelectedTemplate(template)}
            activeOpacity={0.7}
          >
            <View style={styles.templateThumbnail}>
              <Text style={styles.templateLabel}>
                {template === 'A' && 'Big Stats'}
                {template === 'B' && 'Map'}
                {template === 'C' && 'Minimal'}
                {template === 'D' && 'Charts'}
                {template === 'E' && 'Brand 3'}
                {template === 'F' && 'Journal'}
              </Text>
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Share Studio</Text>
          <View style={styles.headerSpacer} />
        </View>

      
          {/* Preview */}
          <View style={styles.previewContainer}>
            <View style={styles.previewWrapper}>
              <ViewShot
                ref={viewShotRef}
                options={{
                  format: backgroundType === 'transparent' ? 'png' : 'jpg',
                  quality: 1,
                  result: 'tmpfile',
                  width: TEMPLATE_WIDTH,
                  height: TEMPLATE_HEIGHT,
                }}
                style={styles.viewShot}
              >
                {renderTemplate()}
              </ViewShot>
            </View>
            {/* Grayscale toggle - only visible when photo background */}
            {backgroundType === 'photo' && (
              <TouchableOpacity
                style={[
                  styles.grayscaleToggle,
                  isGrayscale && styles.grayscaleToggleActive,
                ]}
                onPress={() => setIsGrayscale(!isGrayscale)}
                activeOpacity={0.7}
              >
                <Text style={styles.grayscaleToggleText}>B&W</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Template Selector */}
          {renderTemplateSelector()}

          {/* Background Picker - different for each template type */}
          {selectedTemplate !== 'B' && selectedTemplate !== 'F' && (
            <View style={styles.section}>
              {selectedTemplate === 'A' ? (
                // Big Stats: Brand 1, Transparent, Photo
                <BackgroundPickerBigStats
                  selectedType={backgroundType}
                  selectedImage={backgroundImage}
                  onSelectType={setBackgroundType}
                  onSelectImage={setBackgroundImage}
                />
              ) : selectedTemplate === 'C' ? (
                // Minimal: Brand 2, Transparent, Photo (under mask)
                <BackgroundPickerMinimal
                  selectedType={backgroundType}
                  selectedImage={backgroundImage}
                  onSelectType={setBackgroundType}
                  onSelectImage={setBackgroundImage}
                />
              ) : selectedTemplate === 'D' ? (
                // Charts: Brand 1, Brand 5, Brand 2, Transparent, Photo
                <BackgroundPickerCharts
                  selectedType={backgroundType}
                  selectedImage={backgroundImage}
                  onSelectType={setBackgroundType}
                  onSelectImage={setBackgroundImage}
                />
              ) : selectedTemplate === 'E' ? (
                // Brand 3: Photo, Transparent (mask overlay)
                <BackgroundPickerSimple
                  selectedType={backgroundType}
                  selectedImage={backgroundImage}
                  onSelectType={setBackgroundType}
                  onSelectImage={setBackgroundImage}
                />
              ) : null}
            </View>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.storiesButton]}
            onPress={handleShareToStories}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                {/*<Text style={styles.actionButtonIcon}>📤</Text>*/}
                <Text style={styles.actionButtonText}>Share to Instagram</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton]}
            onPress={handleSaveToPhotos}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                {/*<Text style={styles.actionButtonIcon}>💾</Text>*/}
                <Text style={styles.actionButtonText}>Save to Photos</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.3',
    backgroundColor: '#1a1a1a',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
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
    backgroundColor: '#222',
  },
  previewWrapper: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  viewShot: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    transform: [{scale: PREVIEW_WIDTH / TEMPLATE_WIDTH}],
    transformOrigin: 'top left',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
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
    backgroundColor: '#2d2d2d',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateOptionSelected: {
    borderColor: '#274dd3',
    backgroundColor: 'rgba(39, 77, 211, 0.05)',
  },
  templateThumbnail: {
    width: '100%',
    aspectRatio: 12 / 8,
    backgroundColor: '#212121',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  templateLabel: {
    fontSize: 11,
    color: '#fff',
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
    backgroundColor: '#274dd3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateCheckText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 8,
    gap: 12,
    backgroundColor: '#222',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
  },
  storiesButton: {
    backgroundColor: 'transparent',
  },
  saveButton: {
    backgroundColor: 'transparent',
  },
  actionButtonIcon: {
    fontSize: 16,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  grayscaleToggle: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  grayscaleToggleActive: {
    backgroundColor: 'rgba(39, 77, 211, 0.8)',
    borderColor: '#274dd3',
  },
  grayscaleToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ShareStudioModal;
