import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ImageBackground, Dimensions} from 'react-native';

const {width: screenWidth} = Dimensions.get('window');

interface TrainingCardProps {
  title: string;
  description?: string;
  intensity?: string;
  duration?: string | number;
  backgroundColor?: string;
  trainingType?: string;
  size?: 'normal' | 'large' | 'small';
  variant?: 'priority' | 'recovery' | 'preferable' | 'most-recommended';
  showBadge?: boolean;
  badgeText?: string;
  showOverlay?: boolean; // показывать темный оверлей
  textColor?: 'white' | 'black'; // цвет текста
  onPress?: () => void;
  backgroundImage?: any; // для require()
}

export const TrainingCard: React.FC<TrainingCardProps> = ({
  title,
  description,
  intensity,
  duration,
  backgroundColor,
  size = 'normal',
  variant = 'priority',
  showBadge = false,
  badgeText = '',
  showOverlay = true, // по умолчанию показываем оверлей
  textColor = 'white', // по умолчанию белый текст
  onPress,
  backgroundImage = require('../assets/img/blob4.png'), // дефолтная картинка
}) => {
  // Определяем размеры карточки
  const getCardStyle = () => {
    switch (size) {
      case 'large':
        return {width: 280, height: 320};
      case 'small':
        return {width: 195, height: 240};
      case 'normal':
      default:
        return {width:212, height: 320};
    }
  };

  // Определяем цвет бейджа
  const getBadgeColor = () => {
    switch (variant) {
      case 'most-recommended':
        return '#FF5E00';
      case 'priority':
        return '#274dd3';
      case 'preferable':
        return '#10b981';
      default:
        return '#666';
    }
  };

  // Определяем цвета текста
  const getTextColors = () => {
    if (textColor === 'black') {
      return {
        primary: '#1a1a1a',
        secondary: 'rgba(26, 26, 26, 0.7)',
        tertiary: 'rgba(26, 26, 26, 0.5)',
      };
    }
    // white (по умолчанию)
    return {
      primary: '#fff',
      secondary: 'rgba(255, 255, 255, 0.8)',
      tertiary: 'rgba(255, 255, 255, 0.6)',
    };
  };

  const colors = getTextColors();

  // Контент карточки (одинаковый для обоих вариантов)
  const cardContent = (
    <>
      {showOverlay && <View style={styles.overlay} />}
      
      <View style={styles.content}>
        {showBadge && badgeText && (
          <View style={[styles.badge, {backgroundColor: getBadgeColor()}]}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}

        <View style={styles.textContent}>
          <Text style={[styles.title, {color: colors.primary}]}>{title}</Text>
          
          {description && (
            <Text style={[styles.description, {color: colors.secondary}]} numberOfLines={3}>
              {description}
            </Text>
          )}
          
          <View style={styles.details}>
            {intensity && (
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, {color: colors.tertiary}]}>Intensity:</Text>
                <Text style={[styles.detailValue, {color: colors.primary}]}>{intensity}</Text>
              </View>
            )}
            {duration && (
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, {color: colors.tertiary}]}>Duration:</Text>
                <Text style={[styles.detailValue, {color: colors.primary}]}>
                  {typeof duration === 'number' ? `${duration} min` : duration}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <View style={styles.button}>
            <Text style={[styles.buttonText, {color: colors.primary}]}>How to train →</Text>
          </View>
        </View>
      </View>
    </>
  );

  return (
    <TouchableOpacity
      style={[styles.container, getCardStyle(), variant === 'most-recommended' && {width: '100%'}]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {backgroundColor ? (
        // Используем сплошной цвет
        <View style={[styles.background, {backgroundColor}]}>
          {cardContent}
        </View>
      ) : (
        // Используем изображение
        <ImageBackground
          source={backgroundImage}
          style={styles.background}
          imageStyle={styles.backgroundImage}
        >
          {cardContent}
        </ImageBackground>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 8,
    width: '100%',
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundImage: {
    resizeMode: 'cover',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 20,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  textContent: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
    lineHeight: 18,
  },
  details: {
    marginTop: 'auto',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginRight: 6,
  },
  detailValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 12,
  },
  button: {
   
    paddingVertical: 10,
    marginTop: 12,
    alignItems: 'flex-start',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
