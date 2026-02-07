import {Activity} from '../../types/activity';

export type BackgroundType = 'branded1' | 'branded2' | 'branded5' | 'gradient' | 'transparent' | 'photo';

export interface StreamData {
  velocity_smooth?: {data: number[]};
  heartrate?: {data: number[]};
  cadence?: {data: number[]};
  watts?: {data: number[]};
  altitude?: {data: number[]};
}

export interface TemplateProps {
  activity: Activity;
  backgroundType: BackgroundType;
  backgroundImage?: string; // URI from gallery
  trackCoordinates?: Array<{latitude: number; longitude: number}>;
  streams?: StreamData;
  isGrayscale?: boolean; // B&W mode for photo background
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
  dark: ['#0a0a0a', '#1a1a2e', '#16213e'],
  blue: ['#0f2027', '#203a43', '#2c5364'],
  purple: ['#0f0c29', '#302b63', '#24243e'],
  sunset: ['#0f0c29', '#4a2c2a', '#1a1a2e'],
};
