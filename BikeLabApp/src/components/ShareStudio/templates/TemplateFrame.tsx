/**
 * TemplateFrame - shared canvas + background-layer primitives for the six
 * Share Studio templates (T-5.4).
 *
 * Every `TemplateX.tsx` used to re-implement its own 1080x1920
 * `<View style={{width, height}}>` root and its own `renderBackground()`
 * switch over `branded1/branded2/.../transparent/photo` — this factors that
 * out so a template only supplies which branded images it has and what
 * kind of overlay sits on top of a photo background. Visual output is
 * unchanged: the branded-image set, overlay colors/gradients and photo
 * grayscale handling are copied verbatim from the template that used them,
 * just parameterized instead of duplicated.
 *
 * `StatBlock`/`StatRow` are plain label+value building blocks — templates
 * keep full control of typography/spacing via their own `StyleSheet`s, this
 * just removes the repeated `<View><Text>{label}</Text><Text>{value}</Text></View>`
 * JSX shape.
 */
import React from 'react';
import {View, Text, StyleSheet, Image, ImageSourcePropType, StyleProp, ViewStyle, TextStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Grayscale} from 'react-native-color-matrix-image-filters';
import {BackgroundType, TEMPLATE_WIDTH, TEMPLATE_HEIGHT, GRADIENTS} from '../types';

interface TemplateCanvasProps {
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/** The fixed 1080x1920 canvas every template renders into for capture. */
export const TemplateCanvas: React.FC<TemplateCanvasProps> = ({backgroundColor = '#0a0a0a', style, children}) => (
  <View style={[styles.canvas, {backgroundColor}, style]}>{children}</View>
);

export type BackgroundOverlay =
  | 'none'
  /** Flat dark scrim over a photo (Template A). */
  | 'dim'
  /** Blue-tinted top + black bottom gradient over a photo (Templates C/D). */
  | 'gradient';

interface BackgroundLayerProps {
  backgroundType: BackgroundType;
  backgroundImage?: string;
  isGrayscale?: boolean;
  /** Branded-image sources this template supports, keyed by BackgroundType. */
  brandedSources?: Partial<Record<BackgroundType, ImageSourcePropType>>;
  /** Which BackgroundType falls through to a branded image (default: any key present in brandedSources). */
  overlay?: BackgroundOverlay;
  /** Gradient overlay colors when overlay === 'gradient' (top, then bottom). */
  gradientOverlayColors?: {top: [string, string]; bottom: [string, string]};
  /** Fallback when backgroundType matches none of the above (default: dark GRADIENTS.dark). */
  fallback?: React.ReactNode;
}

/**
 * Renders the background layer shared by templates A/C/D: a branded image
 * for `branded*` types, the user's photo (optionally grayscaled, optionally
 * with a dim or gradient overlay) for `photo`, nothing for `transparent`,
 * and a caller-supplied fallback (or a dark gradient) otherwise.
 */
export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  backgroundType,
  backgroundImage,
  isGrayscale,
  brandedSources,
  overlay = 'none',
  gradientOverlayColors,
  fallback,
}) => {
  const brandedSource = brandedSources?.[backgroundType];
  if (brandedSource) {
    return <Image source={brandedSource} style={styles.fill} resizeMode="cover" />;
  }

  if (backgroundType === 'photo' && backgroundImage) {
    const photoImage = <Image source={{uri: backgroundImage}} style={styles.fill} resizeMode="cover" />;
    return (
      <>
        {isGrayscale ? <Grayscale style={styles.fill}>{photoImage}</Grayscale> : photoImage}
        {overlay === 'dim' && <View style={styles.dimOverlay} />}
        {overlay === 'gradient' && gradientOverlayColors && (
          <GradientOverlay colors={gradientOverlayColors} />
        )}
      </>
    );
  }

  if (backgroundType === 'transparent') {
    return <View style={styles.transparent} />;
  }

  return <>{fallback ?? <LinearGradient colors={GRADIENTS.dark} style={styles.fill} start={{x: 0, y: 0}} end={{x: 1, y: 1}} />}</>;
};

const GradientOverlay: React.FC<{colors: {top: [string, string]; bottom: [string, string]}}> = ({colors}) => (
  <>
    <LinearGradient
      colors={colors.top}
      style={[styles.gradientOverlayLayer, styles.gradientOverlayTop]}
      start={{x: 0.5, y: 0}}
      end={{x: 0.5, y: 1}}
    />
    <LinearGradient
      colors={colors.bottom}
      style={[styles.gradientOverlayLayer, styles.gradientOverlayBottom]}
      start={{x: 0.5, y: 0}}
      end={{x: 0.5, y: 1}}
    />
  </>
);

interface StatBlockProps {
  label: string;
  value: string | number;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
  /** Template B shrinks its stat values to fit a fixed-width column; every other template leaves the value at its set size. */
  shrinkToFit?: boolean;
}

/** A single label-over-value stat, styled entirely by the caller. */
export const StatBlock: React.FC<StatBlockProps> = ({label, value, style, labelStyle, valueStyle, shrinkToFit}) => (
  <View style={style}>
    <Text style={labelStyle}>{label}</Text>
    <Text
      style={valueStyle}
      {...(shrinkToFit ? {numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.6} : null)}>
      {value}
    </Text>
  </View>
);

interface StatRowProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A horizontal row of `StatBlock`s. */
export const StatRow: React.FC<StatRowProps> = ({children, style}) => <View style={style}>{children}</View>;

const styles = StyleSheet.create({
  canvas: {
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    width: TEMPLATE_WIDTH,
    height: TEMPLATE_HEIGHT,
  },
  transparent: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  gradientOverlayLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: TEMPLATE_WIDTH,
  },
  gradientOverlayTop: {
    top: 0,
    height: TEMPLATE_HEIGHT,
  },
  gradientOverlayBottom: {
    bottom: 0,
    height: TEMPLATE_HEIGHT,
  },
});
