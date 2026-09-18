// The 3-photo "bike garage" carousel + its upload flow. Extracted from
// GarageScreen.tsx (T-5.4, audit A-27) — owns its own data (useGarageImages)
// and upload-modal UI state since nothing else on the screen needs either.
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AddPhotoIcon } from '../../assets/img/icons/AddPhotoIcon';
import { ImageUploadModal } from '../../components/ImageUploadModal';
import { useGarageImages } from '../../data/hooks/useGarageImages';
import { makeStyles } from '../../theme';
import { getGarageImageUrl, type GaragePosition } from './lib';

const POSITIONS: GaragePosition[] = ['right', 'left-top', 'left-bottom'];

export const GarageGallery: React.FC = () => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const { data: garageImages, refetch } = useGarageImages();
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadPosition, setUploadPosition] = useState<GaragePosition>('right');

  const openUploadModal = useCallback((position: GaragePosition) => {
    setUploadPosition(position);
    setUploadModalVisible(true);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={windowWidth * 0.9 + 8}
        snapToAlignment="start"
        style={styles.garageCarousel}
        contentContainerStyle={styles.garageCarouselContent}
      >
        {POSITIONS.map(position => {
          const url = garageImages
            ? getGarageImageUrl(garageImages, position)
            : null;
          return (
            <TouchableOpacity
              key={position}
              style={[styles.garageImageBox, { width: windowWidth * 0.68 }]}
              activeOpacity={0.8}
              onPress={() => openUploadModal(position)}
            >
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={styles.garageImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.garageImagePlaceholderBox}>
                  <AddPhotoIcon size={32} color="rgba(0, 0, 0, 0.25)" />
                  <Text style={styles.garageImagePlaceholder}>
                    {t('garage.addPhoto')}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ImageUploadModal
        visible={uploadModalVisible}
        position={uploadPosition}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </>
  );
};

const styles = makeStyles(theme => ({
  garageCarousel: {
    marginBottom: theme.spacing[16],
  },
  garageCarouselContent: {
    paddingHorizontal: theme.spacing[16],
    gap: theme.spacing[8],
  },
  garageImageBox: {
    height: 390,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radii.md,
  },
  garageImage: {
    width: '100%',
    height: '100%',
  },
  garageImagePlaceholderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[8],
    backgroundColor: '#f1f0f0',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderStyle: 'dashed',
    width: '100%',
    height: '100%',
  },
  garageImagePlaceholder: {
    color: 'rgba(0,0,0,0.3)',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.medium,
  },
}));
