import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {launchImageLibrary, launchCamera, type ImagePickerResponse} from 'react-native-image-picker';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import ViewShot from 'react-native-view-shot';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AddPhotoIcon} from '../assets/img/icons/AddPhotoIcon';
import {API_BASE_URL} from '../utils/api';

const IMAGE_MAX_SIZE = 1200;
const IMAGE_QUALITY = 0.7 as const;

type GaragePosition = 'right' | 'left-top' | 'left-bottom';

interface ImageUploadModalProps {
  visible: boolean;
  position: GaragePosition;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  visible,
  position,
  onClose,
  onUploadSuccess,
}) => {
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    type: string;
    fileName: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isGrayscale, setIsGrayscale] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  const handlePickerResponse = (response: ImagePickerResponse) => {
    if (response.didCancel) return;
    if (response.errorCode) {
      Alert.alert('Error', response.errorMessage || 'Failed to pick image');
      return;
    }
    const asset = response.assets?.[0];
    if (asset?.uri) {
      setSelectedImage({
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
      });
    }
  };

  const pickerOptions = {
    mediaType: 'photo' as const,
    quality: IMAGE_QUALITY,
    maxWidth: IMAGE_MAX_SIZE,
    maxHeight: IMAGE_MAX_SIZE,
  };

  const handlePickImage = () => {
    launchImageLibrary(pickerOptions, handlePickerResponse);
  };

  const handleTakePhoto = () => {
    launchCamera(pickerOptions, handlePickerResponse);
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    setUploading(true);
    try {
      let token = await AsyncStorage.getItem('token');
      if (!token) {
        token = await AsyncStorage.getItem('sessionToken');
      }

      // If B&W is on, capture the grayscale-rendered image
      let uploadUri = selectedImage.uri;
      let uploadType = selectedImage.type;
      let uploadName = selectedImage.fileName;

      if (isGrayscale && viewShotRef.current?.capture) {
        const capturedUri = await viewShotRef.current.capture();
        uploadUri = capturedUri;
        uploadType = 'image/jpeg';
        uploadName = uploadName.replace(/\.\w+$/, '.jpg');
      }

      const formData = new FormData();
      formData.append('image', {
        uri: uploadUri,
        type: uploadType,
        name: uploadName,
      } as any);
      formData.append('pos', position);

      const response = await fetch(`${API_BASE_URL}/api/garage/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${response.status})`);
      }

      // Clear cached garage images so they reload from API
      await AsyncStorage.removeItem('garage_images_cache');

      onUploadSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'Please try again');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setIsGrayscale(false);
    onClose();
  };

  const POSITION_LABELS: Record<GaragePosition, string> = {
    right: 'Photo 1',
    'left-top': 'Photo 2',
    'left-bottom': 'Photo 3',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{POSITION_LABELS[position]}</Text>
            <TouchableOpacity onPress={handleClose} disabled={uploading}>
              <Text style={styles.closeButton}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Hidden ViewShot for capturing grayscale at full resolution */}
          {selectedImage && isGrayscale && (
            <View style={styles.hiddenCapture}>
              <ViewShot ref={viewShotRef} options={{format: 'jpg', quality: 0.1}}>
                <Grayscale>
                  <Image
                    source={{uri: selectedImage.uri}}
                    style={{width: IMAGE_MAX_SIZE, height: IMAGE_MAX_SIZE}}
                    resizeMode="contain"
                  />
                </Grayscale>
              </ViewShot>
            </View>
          )}

          {/* Preview / Picker area */}
          <View style={styles.previewArea}>
            {selectedImage ? (
              <TouchableOpacity
                style={styles.previewContainer}
                onPress={handlePickImage}
                disabled={uploading}>
                {isGrayscale ? (
                  <Grayscale style={styles.previewImage}>
                    <Image
                      source={{uri: selectedImage.uri}}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  </Grayscale>
                ) : (
                  <Image
                    source={{uri: selectedImage.uri}}
                    style={styles.previewImage}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.previewOverlay}>
                  <Text style={styles.previewOverlayText}>Tap to change</Text>
                </View>
                {/* B&W toggle */}
                <TouchableOpacity
                  style={[
                    styles.bwToggle,
                    isGrayscale && styles.bwToggleActive,
                  ]}
                  onPress={() => setIsGrayscale(!isGrayscale)}
                  activeOpacity={0.7}>
                  <Text style={styles.bwToggleText}>B&W</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <View style={styles.pickerButtons}>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={handlePickImage}>
                  <AddPhotoIcon size={36} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.pickerButtonText}>Choose from Library</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={uploading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.uploadButton,
                (!selectedImage || uploading) && styles.uploadButtonDisabled,
              ]}
              onPress={handleUpload}
              disabled={!selectedImage || uploading}>
              {uploading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.uploadButtonText}>Upload</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 28,
  },
  previewArea: {
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    width: '100%',
    height: 320,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewOverlayText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  bwToggle: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  bwToggleActive: {
    backgroundColor: 'rgba(39, 77, 211, 0.8)',
    borderColor: '#274dd3',
  },
  bwToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  hiddenCapture: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    opacity: 0,
  },
  pickerButtons: {
    flexDirection: 'row',
    gap: 16,
    padding: 24,
  },
  pickerButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pickerButtonIcon: {
    fontSize: 32,
  },
  pickerButtonText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  uploadButton: {
    backgroundColor: '#274dd3',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  uploadButtonDisabled: {
    opacity: 0.4,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
