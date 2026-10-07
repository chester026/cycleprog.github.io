import {useMutation} from '@tanstack/react-query';
import {api, bikes} from '../api';

export interface ResetBikeComponentInput {
  bikeId: string;
  component: string;
  /** Km the part already had when registered (used bike); omitted = a new part. */
  initialKm?: number;
}

/** POST /api/bikes/:bikeId/components/:component/reset. */
export function useResetBikeComponent() {
  return useMutation({
    mutationFn: ({bikeId, component, initialKm}: ResetBikeComponentInput) =>
      api.call(bikes.resetComponent, {
        params: {bikeId, component},
        body: initialKm ? {initial_km: initialKm} : undefined,
      }),
  });
}

export interface BikeOnboardingReset {
  component: string;
  resetKm: number;
  initialKm?: number;
}

export interface BikeOnboardingInput {
  bikeId: string;
  resets: BikeOnboardingReset[];
}

/** POST /api/bikes/:bikeId/onboarding — bulk initial component setup. */
export function useBikeOnboarding() {
  return useMutation({
    mutationFn: ({bikeId, resets}: BikeOnboardingInput) =>
      api.call(bikes.onboarding, {
        params: {bikeId},
        body: {
          resets: resets.map(({component, resetKm, initialKm}) => ({
            component,
            resetKm,
            ...(initialKm ? {initial_km: initialKm} : {}),
          })),
        },
      }),
  });
}
