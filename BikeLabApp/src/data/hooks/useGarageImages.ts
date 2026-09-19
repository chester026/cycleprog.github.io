import {useQuery} from '@tanstack/react-query';
import {api, media} from '../api';
import {queryKeys} from '../keys';

export interface GarageImageSlot {
  url: string;
  fileId: string;
  name: string;
}

export interface GarageImages {
  'left-top'?: GarageImageSlot;
  'left-bottom'?: GarageImageSlot;
  right?: GarageImageSlot;
}

/**
 * GET /api/garage/positions — GarageScreen's 3 bike-garage photo slots
 * (T-5.4/A-27; replaces the `garage_images_cache` AsyncStorage entry
 * GarageScreen/ImageUploadModal used to read/write directly).
 */
export function useGarageImages() {
  return useQuery({
    queryKey: queryKeys.garageImages,
    queryFn: () => api.call(media.garagePositions) as Promise<GarageImages>,
  });
}
