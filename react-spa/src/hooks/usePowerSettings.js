import { useState } from 'react';
import { useProfile } from '../data/hooks';

// T-6.3 (audit W-26 follow-up): PowerAnalysis used to keep its own
// `powerAnalysis_riderWeight`/`powerAnalysis_bikeWeight`/
// `powerAnalysis_surfaceType` localStorage cache for a rider/bike weight +
// surface + "include wind" settings panel. That physics estimate now runs
// server-side (T-3.5, `@bikelab/shared/calc/power.ts` +
// `server/services/power.js`) and is attached to every activity as
// `activity.estimated_power` — there's nothing left client-side to
// configure the estimate itself with. This hook is what's left of "power
// settings" for the component: rider/bike weight for display (sourced from
// the shared TanStack `useProfile` cache, never localStorage) plus the
// best-list sort/selection UI toggles as plain local React state.
export function usePowerSettings() {
  const { data: profile } = useProfile();
  const [sortBy, setSortBy] = useState('power');
  const [selectedId, setSelectedId] = useState(null);

  return {
    riderWeight: profile?.weight ?? null,
    bikeWeight: profile?.bike_weight ?? null,
    sortBy,
    setSortBy,
    selectedId,
    setSelectedId,
  };
}
