import {Activity} from '../../types/activity';
import {colors} from '../../theme';

export type BackgroundType = 'branded1' | 'branded2' | 'branded5' | 'gradient' | 'transparent' | 'photo';

export interface StreamData {
  velocity_smooth?: {data: number[]};
  heartrate?: {data: number[]};
  cadence?: {data: number[]};
  watts?: {data: number[]};
  altitude?: {data: number[]};
}

export type MapStyle = 'dark' | 'light';

export interface TemplateProps {
  activity: Activity;
  backgroundType: BackgroundType;
  backgroundImage?: string; // URI from gallery
  trackCoordinates?: Array<{latitude: number; longitude: number}>;
  streams?: StreamData;
  isGrayscale?: boolean; // B&W mode for photo background
  mapStyle?: MapStyle;
}

export interface ShareStudioProps {
  visible: boolean;
  onClose: () => void;
  activity: Activity;
  trackCoordinates?: Array<{latitude: number; longitude: number}>;
  streams?: StreamData;
}

export const TEMPLATE_WIDTH = 1080;
export const TEMPLATE_HEIGHT = 1920;
export const SCALE_FACTOR = 0.18; // For preview (1080 * 0.18 ≈ 194px width)

// Gradient presets
export const GRADIENTS: Record<string, string[]> = {
  dark: [...colors.share.gradients.dark],
  blue: [...colors.share.gradients.blue],
  purple: [...colors.share.gradients.purple],
  sunset: [...colors.share.gradients.sunset],
};
