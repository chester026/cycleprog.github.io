/**
 * ShareStudioShell - the chrome every Share Studio flavour shares: header,
 * scaled 1080x1920 preview wrapped in ViewShot, B&W toggle, a scrolling
 * controls area and the Instagram/Save export bar, plus the capture/share/
 * save logic behind it.
 *
 * Extracted out of `ShareStudioModal` when goal sharing arrived
 * (GoalShareStudioModal) so the ride and goal studios differ only in what
 * they render and which controls they show — the capture pipeline, the
 * Instagram-then-generic-share fallback and the save-to-album behaviour stay
 * in exactly one place. Behaviour is unchanged from the pre-split modal.
 */
import React, {useState, useRef, useCallback} from 'react';
import {View, Text, Modal, TouchableOpacity, ScrollView, Alert, useWindowDimensions} from 'react-native';
import {useTranslation} from 'react-i18next';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {ExportBar} from './ExportBar';
import {TEMPLATE_WIDTH, TEMPLATE_HEIGHT} from './types';
import {logger} from '../../lib/logger';
import {makeStyles, withOpacity} from '../../theme';

export interface ShareStudioShellProps {
  visible: boolean;
  onClose: () => void;
  /** Header title — defaults to `shareStudio.title`. */
  title?: string;
  /** PNG capture (keeps the alpha channel) instead of JPEG. */
  transparent: boolean;
  /** B&W toggle over the preview — only meaningful with a photo background. */
  showGrayscaleToggle: boolean;
  isGrayscale: boolean;
  onToggleGrayscale: () => void;
  /** Caption for the generic share sheet when Instagram isn't available. */
  shareMessage: string;
  /** The 1080x1920 template to capture. */
  preview: React.ReactNode;
  /** Controls rendered under the preview (template carousel, pickers…). */
  children?: React.ReactNode;
  /** Laid over the preview but NOT captured (e.g. a "choose photo" prompt). */
  previewOverlay?: React.ReactNode;
}

export const ShareStudioShell: React.FC<ShareStudioShellProps> = ({
  visible,
  onClose,
  title,
  transparent,
  showGrayscaleToggle,
  isGrayscale,
  onToggleGrayscale,
  shareMessage,
  preview,
  children,
  previewOverlay,
}) => {
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
  const previewWidth = screenWidth - 160;
  const previewHeight = previewWidth * (TEMPLATE_HEIGHT / TEMPLATE_WIDTH);

  const [isProcessing, setIsProcessing] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

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
          type: transparent ? 'image/png' : 'image/jpeg',
          message: shareMessage,
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title ?? t('shareStudio.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.previewContainer}>
          <View style={[styles.previewWrapper, {width: previewWidth, height: previewHeight}]}>
            <ViewShot
              ref={viewShotRef}
              options={{
                format: transparent ? 'png' : 'jpg',
                quality: 1,
                result: 'tmpfile',
                width: TEMPLATE_WIDTH,
                height: TEMPLATE_HEIGHT,
              }}
              style={[styles.viewShot, {transform: [{scale: previewWidth / TEMPLATE_WIDTH}]}]}>
              {preview}
            </ViewShot>
            {previewOverlay ? <View style={styles.previewOverlay}>{previewOverlay}</View> : null}
          </View>
          {showGrayscaleToggle ? (
            <TouchableOpacity
              style={[styles.grayscaleToggle, isGrayscale && styles.grayscaleToggleActive]}
              onPress={onToggleGrayscale}
              activeOpacity={0.7}>
              <Text style={styles.grayscaleToggleText}>{t('shareStudio.bw')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {children}
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
    backgroundColor: theme.colors.share.darkPanelBg,
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
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewShot: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
    transformOrigin: 'top left',
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

export default ShareStudioShell;
