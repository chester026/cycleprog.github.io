import {useQuery} from '@tanstack/react-query';
import {api, garmin} from '../api';
import {queryKeys} from '../keys';
import type {EndpointResponse} from '../api';

export type GarminConnectStatus = EndpointResponse<typeof garmin.connectStatus>;

/**
 * GET /api/garmin/connect/status — whether the rider's Garmin Connect
 * account feeds rides into BikeLab (GarminConnectCard). Not the Edge
 * pairing: that is useGarminDevices.
 */
export function useGarminConnectStatus() {
  return useQuery({
    queryKey: queryKeys.garminConnectStatus,
    queryFn: () => api.call(garmin.connectStatus),
  });
}
