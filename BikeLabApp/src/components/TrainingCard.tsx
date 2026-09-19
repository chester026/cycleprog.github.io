import React from 'react';
import {View, Text, TouchableOpacity, ImageBackground, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';
import {makeStyles, useTheme, withOpacity} from '../theme';

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
  const {t} = useTranslation();
  const theme = useTheme();
  // Определяем размеры карточки
  const getCardStyle = () => {
    switch (size) {
      case 'large':
        return {width: 280, height: 320};
      case 'small':
        return {width: 195, height: 240};
      case 'normal':
      default:
        return {width: 212, height: 320};
    }
  };

  // Определяем цвет бейджа
  const getBadgeColor = () => {
    switch (variant) {
      case 'most-recommended':
        return theme.colors.chart.series3; // #FF5E00
      case 'priority':
        return theme.colors.accent;
      case 'preferable':
        return theme.colors.success;
      default:
        return theme.colors.text.secondary;
    }
  };

  // Определяем цвета текста
  const getTextColors = () => {
    if (textColor === 'black') {
      return {
        primary: theme.colors.text.primary,
        secondary: withOpacity(theme.colors.text.primary, 0.7),
        tertiary: withOpacity(theme.colors.text.primary, 0.5),
      };
    }
    // white (по умолчанию)
    return {
      primary: theme.colors.text.inverse,
      secondary: withOpacity(theme.colors.text.inverse, 0.8),
      tertiary: withOpacity(theme.colors.text.inverse, 0.6),
    };
  };

  const colors = getTextColors();

  // Контент карточки (одинаковый для обоих вариантов)
  const cardContent = (
    <>
      {showOverlay ? <View style={styles.overlay} /> : null}

      <View style={styles.content}>
        {showBadge && badgeText ? <View style={[styles.badge, {backgroundColor: getBadgeColor()}]}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View> : null}

        <View style={styles.textContent}>
          <Text style={[styles.title, {color: colors.primary}]}>{title}</Text>

          {description ? <Text style={[styles.description, {color: colors.secondary}]} numberOfLines={3}>
              {description}
            </Text> : null}

          <View style={styles.details}>
            {intensity ? <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, {color: colors.tertiary}]}>{t('training.intensity')}</Text>
                <Text style={[styles.detailValue, {color: colors.primary}]}>{intensity}</Text>
              </View> : null}
            {!!duration && (
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, {color: colors.tertiary}]}>{t('training.duration')}</Text>
                <Text style={[styles.detailValue, {color: colors.primary}]}>
                  {typeof duration === 'number' ? `${duration} min` : duration}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <View style={styles.button}>
            <Text style={[styles.buttonText, {color: colors.primary}]}>{t('training.howToTrain')}</Text>
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

const styles = makeStyles(theme => ({
  container: {
    borderRadius: theme.radii.none,
    overflow: 'hidden',
    marginBottom: theme.spacing[8],
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
    backgroundColor: theme.colors.scrim,
  },
  content: {
    flex: 1,
    padding: theme.spacing[16],
    justifyContent: 'space-between',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[6],
    marginBottom: theme.spacing[20],
  },
  badgeText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.bold,
    textTransform: 'uppercase',
  },
  textContent: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.inverse,
    marginBottom: theme.spacing[8],
  },
  description: {
    fontSize: theme.typography.fontSize.base,
    color: withOpacity(theme.colors.text.inverse, 0.8),
    marginBottom: theme.spacing[12],
    lineHeight: theme.typography.lineHeight.tight,
  },
  details: {
    marginTop: 'auto',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
  },
  detailLabel: {
    fontSize: theme.typography.fontSize.md,
    color: withOpacity(theme.colors.text.inverse, 0.6),
    marginRight: theme.spacing[6],
  },
  detailValue: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.inverse,
    fontWeight: theme.typography.fontWeight.medium,
  },
  buttonContainer: {
    marginTop: theme.spacing[12],
  },
  button: {
    paddingVertical: theme.spacing[10],
    marginTop: theme.spacing[12],
    alignItems: 'flex-start',
  },
  buttonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
  },
}));
