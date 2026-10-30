import {useQuery} from '@tanstack/react-query';
import {api, garmin} from '../api';
import {queryKeys} from '../keys';
import type {EndpointResponse} from '../api';

export type GarminDevice = EndpointResponse<typeof garmin.devices>[number];

/** GET /api/garmin/devices — Edge computers paired via the BikeLab Connect IQ app. */
export function useGarminDevices() {
  return useQuery({
    queryKey: queryKeys.garminDevices,
    queryFn: () => api.call(garmin.devices),
  });
}
