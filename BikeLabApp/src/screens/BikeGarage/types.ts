// Extracted from BikeGarageScreen.tsx (screen decomposition, T-5.5 /
// GUIDE-5b). Shared shapes used by the screen and every sub-component
// below — not part of `@bikelab/shared/types` since `/api/bikes/:id/health`
// isn't in the typed API contract yet (owned by the data-layer migration
// agent, out of this task's scope).
export interface ComponentHealth {
  id: string;
  healthPercent: number;
  kmSinceReset: number;
  effectiveKm: number;
  baseLifecycle: number;
  remainingKm: number;
  status: 'good' | 'warning' | 'attention' | 'critical';
  weightFactor: number;
  styleFactor: number;
  lastResetAt: string | null;
  lastResetKm: number;
}

export interface BikeHealth {
  bikeId: string;
  totalKm: number;
  riderWeight: number;
  ridingStyle: {climbing: number; sprint: number; power: number};
  riderProfile: {profile: string; emoji: string};
  components: ComponentHealth[];
  overallHealth: number;
  nextService: {component: string; inKm: number};
  onboardingCompleted: boolean;
  // Custom gear names — see server.js's bike_component_labels comment.
  // groupLabels keys are group keys ('drivetrain'/'brakes'/'wheels'/
  // 'contact'), componentLabels keys are component ids ('tires', 'pedals'...).
  groupLabels?: Record<string, string>;
  componentLabels?: Record<string, string>;
}

export interface RenameTarget {
  type: 'group' | 'component';
  key: string;
  currentLabel: string;
}
