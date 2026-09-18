/**
 * Bike maintenance component catalog (T-2.4, docs/audit/layers/04-cross-layer.md
 * §4.9, §6.1). `BIKE_COMPONENTS` mirrors `server/server.js:1807-1820`
 * verbatim — server imports it from here instead of redeclaring it.
 * `COMPONENT_LABELS`/`GROUP_LABELS`/`COMPONENT_GROUPS` mirror
 * `react-spa/src/pages/MaintenancePage.jsx` (the web has no i18n layer, so
 * these are the plain-English strings it renders directly).
 * `BikeLabApp/src/screens/BikeGarageScreen.tsx` renders the same groups
 * through `useTranslation()` rather than a hardcoded label map, so it has no
 * label map to reconcile against.
 */

export interface BikeComponentDef {
  id: string;
  baseLifecycle: number;
}

export const BIKE_COMPONENTS: BikeComponentDef[] = [
  { id: 'chain', baseLifecycle: 6000 },
  { id: 'cassette', baseLifecycle: 15000 },
  { id: 'chainrings', baseLifecycle: 20000 },
  { id: 'brake_pads', baseLifecycle: 6000 },
  { id: 'rotors', baseLifecycle: 20000 },
  { id: 'tires', baseLifecycle: 6000 },
  { id: 'sealant', baseLifecycle: 5000 },
  { id: 'wheel_bearings', baseLifecycle: 15000 },
  { id: 'bar_tape', baseLifecycle: 6000 },
  { id: 'saddle', baseLifecycle: 25000 },
  { id: 'pedals', baseLifecycle: 20000 },
  { id: 'cleats', baseLifecycle: 8000 },
];

export type BikeComponentId = (typeof BIKE_COMPONENTS)[number]['id'];

export const COMPONENT_LABELS: Record<string, string> = {
  chain: 'Chain',
  cassette: 'Cassette',
  chainrings: 'Chainrings',
  brake_pads: 'Brake Pads',
  rotors: 'Rotors',
  tires: 'Tires',
  wheel_bearings: 'Wheel Bearings',
  sealant: 'Sealant',
  bar_tape: 'Bar Tape',
  saddle: 'Saddle',
  pedals: 'Pedals',
  cleats: 'Cleats',
};

export const GROUP_LABELS: Record<string, string> = {
  drivetrain: 'Drivetrain',
  brakes: 'Brakes',
  wheels: 'Wheels',
  contact: 'Contact Points',
};

export const COMPONENT_GROUPS: { key: string; ids: string[] }[] = [
  { key: 'drivetrain', ids: ['chain', 'cassette', 'chainrings'] },
  { key: 'brakes', ids: ['brake_pads', 'rotors'] },
  { key: 'wheels', ids: ['tires', 'sealant', 'wheel_bearings'] },
  { key: 'contact', ids: ['bar_tape', 'saddle', 'pedals', 'cleats'] },
];
