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
 *
 * Goal sharing: the modal chrome + capture/share/save pipeline moved into
 * `ShareStudioShell` (shared with `goal/GoalShareStudioModal`); this file
 * now only owns the ride-specific state and controls.
 */

import React, {useState, useCallback} from 'react';
import {View} from 'react-native';
import {TemplateA, TemplateB, TemplateC, TemplateD, TemplateE, TemplateF} from './templates';
import {BackgroundPicker, BackgroundPickerVariant} from './BackgroundPicker';
import {TemplateCarousel, TemplateType} from './TemplateCarousel';
import {MapStylePicker} from './MapStylePicker';
import {ShareStudioShell} from './ShareStudioShell';
import {launchImageLibrary} from 'react-native-image-picker';
import {ShareStudioProps, BackgroundType, MapStyle} from './types';
import {logger} from '../../lib/logger';
import {makeStyles} from '../../theme';

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
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('A');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('branded1');
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const [isGrayscale, setIsGrayscale] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');

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
    <ShareStudioShell
      visible={visible}
      onClose={onClose}
      transparent={backgroundType === 'transparent'}
      showGrayscaleToggle={backgroundType === 'photo'}
      isGrayscale={isGrayscale}
      onToggleGrayscale={() => setIsGrayscale(!isGrayscale)}
      shareMessage={`${activity.name} - ${(activity.distance / 1000).toFixed(1)}km 🚴`}
      preview={renderTemplate()}>
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
      {backgroundPickerVariant ? (
        <View style={styles.section}>
          <BackgroundPicker
            variant={backgroundPickerVariant}
            selectedType={backgroundType}
            selectedImage={backgroundImage}
            onSelectType={setBackgroundType}
            onSelectImage={setBackgroundImage}
          />
        </View>
      ) : null}
    </ShareStudioShell>
  );
};

const styles = makeStyles(() => ({
  section: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
}));

export default ShareStudioModal;
