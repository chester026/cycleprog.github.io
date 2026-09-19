// Pure logic extracted from BikeGarageScreen.tsx (screen decomposition,
// T-5.5 / GUIDE-5b). No React/React Native imports — unit-tested directly
// in lib.test.ts. Behaviour copied 1:1 from the pre-extraction screen; see
// git history on BikeGarageScreen.tsx for the original inline version.
import type {ComponentHealth, BikeHealth} from './types';

export const STATUS_TINT: Record<ComponentHealth['status'], string> = {
  good: '#CCCCCC',
  warning: '#f59e0b',
  attention: '#f59e0b',
  critical: '#ef4444',
};

export const GAUGE_SIZE = 132;
export const GAUGE_STROKE = 7;
export const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
export const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

// Grid card width depends on the current window width (was
// `Dimensions.get('window')` in the original — moved to a hook-driven
// calculation, see ComponentsGrid.tsx's `useWindowDimensions()`, per
// GUIDE-5b's "no Dimensions.get" rule).
const CARD_GAP = 6;
export function computeCardWidth(screenWidth: number): number {
  return (screenWidth - 32 - CARD_GAP * 2) / 3;
}
export {CARD_GAP};

export interface ComponentGroup {
  key: string;
  ids: string[];
}

// Static grouping of component ids into the 4 section headers shown on
// the screen — order matters (rendered in this order).
export const COMPONENT_GROUPS: ComponentGroup[] = [
  {key: 'drivetrain', ids: ['chain', 'cassette', 'chainrings']},
  {key: 'brakes', ids: ['brake_pads', 'rotors']},
  {key: 'wheels', ids: ['tires', 'sealant', 'wheel_bearings']},
  {key: 'contact', ids: ['bar_tape', 'saddle', 'pedals', 'cleats']},
];

export interface ResolvedGroup {
  key: string;
  items: ComponentHealth[];
}

/** Resolves each `COMPONENT_GROUPS` entry's component ids against the
 * health payload's actual components, dropping empty groups and
 * preserving `COMPONENT_GROUPS`' order — same filtering the original
 * inline `.map(...).filter(Boolean)` did. */
export function resolveComponentGroups(components: ComponentHealth[]): ResolvedGroup[] {
  return COMPONENT_GROUPS.map(group => {
    const items = group.ids
      .map(id => components.find(c => c.id === id))
      .filter((c): c is ComponentHealth => !!c);
    return {key: group.key, items};
  }).filter(group => group.items.length > 0);
}

/** Bike display name: "Brand Model" when both are known, else the bike's
 * plain `name`. Used for both the selector pills and the hero title, and
 * for the "ask coach" prompt — kept as one function so all three agree. */
export function bikeDisplayName(bike: {
  brand_name?: string | null;
  model_name?: string | null;
  name: string;
}): string {
  return bike.brand_name && bike.model_name ? `${bike.brand_name} ${bike.model_name}` : bike.name;
}

/** Ranks the 3 riding-style bars (climbing/sprint/power) highest-value
 * first, same as the original inline `.sort((a, b) => b.value - a.value)`. */
export function rankRidingStyle(
  ridingStyle: BikeHealth['ridingStyle'],
  labels: {climbing: string; sprint: string; power: string},
): {key: string; label: string; value: number}[] {
  return [
    {key: 'climbing', label: labels.climbing, value: ridingStyle.climbing},
    {key: 'sprint', label: labels.sprint, value: ridingStyle.sprint},
    {key: 'power', label: labels.power, value: ridingStyle.power},
  ].sort((a, b) => b.value - a.value);
}
