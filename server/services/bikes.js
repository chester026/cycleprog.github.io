// Bike health computation (T-4.1 domain extraction). Moved verbatim from
// server.js — see routes/bikes.js for the routes that use these.
//
// `BIKE_COMPONENTS` is `@bikelab/shared/constants`'s single source of truth
// (T-2.4, docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
// §4.9/§6.1), shared with the web's MaintenancePage.jsx label maps —
// re-exported here so routes/bikes.js and server.js's AI-coach wiring
// (`getBikeComponents`) both go through this one module.
const { BIKE_COMPONENTS } = require('@bikelab/shared/constants');

function computeStyleFactor(componentId, ridingStyle) {
  const { climbing, sprint, power } = ridingStyle;
  switch (componentId) {
    case 'chain': return 1 + (climbing / 100) * 0.3 + (power / 100) * 0.2;
    case 'cassette': return 1 + (sprint / 100) * 0.5 + (power / 100) * 0.3;
    case 'chainrings': return 1 + (power / 100) * 0.3 + (sprint / 100) * 0.2;
    case 'brake_pads': return 1 + (climbing / 100) * 0.8;
    case 'rotors': return 1 + (climbing / 100) * 0.5;
    case 'tires': return 1 + (climbing / 100) * 0.15;
    case 'wheel_bearings': return 1 + (climbing / 100) * 0.1 + (power / 100) * 0.1;
    default: return 1.0; // bar_tape, saddle
  }
}

function getHealthStatus(healthPercent) {
  if (healthPercent > 40) return 'good';
  if (healthPercent > 25) return 'warning';
  if (healthPercent > 15) return 'attention';
  return 'critical';
}

/**
 * Per-component wear + overall health + next-service, given the bike's
 * total distance, rider weight, riding style and any resets already applied
 * — moved verbatim out of `GET /api/bikes/:bikeId/health`'s body (step 6-8).
 */
function computeComponentHealth({ gearTotalKm, riderWeight, ridingStyle, resets }) {
  const weightFactor = riderWeight / 75;
  const components = BIKE_COMPONENTS.map(comp => {
    const reset = resets[comp.id];
    const kmSinceReset = reset ? Math.max(0, gearTotalKm - reset.resetKm) : gearTotalKm;
    const styleFactor = computeStyleFactor(comp.id, ridingStyle);
    const effectiveKm = kmSinceReset * weightFactor * styleFactor;
    const healthPercent = Math.max(0, Math.round(100 - (effectiveKm / comp.baseLifecycle) * 100));
    const remainingKm = Math.max(0, Math.round((comp.baseLifecycle - effectiveKm) / weightFactor / styleFactor));

    return {
      id: comp.id,
      healthPercent,
      kmSinceReset: Math.round(kmSinceReset),
      effectiveKm: Math.round(effectiveKm),
      baseLifecycle: comp.baseLifecycle,
      remainingKm,
      status: getHealthStatus(healthPercent),
      weightFactor: Math.round(weightFactor * 100) / 100,
      styleFactor: Math.round(styleFactor * 100) / 100,
      lastResetAt: reset?.resetAt || null,
      lastResetKm: reset?.resetKm || 0,
    };
  });

  const overallHealth = Math.round(
    components.reduce((s, c) => s + c.healthPercent, 0) / components.length
  );

  const nearest = components.reduce((min, c) => c.remainingKm < min.remainingKm ? c : min, components[0]);

  return { components, overallHealth, nextService: { component: nearest.id, inKm: nearest.remainingKm } };
}

module.exports = {
  BIKE_COMPONENTS,
  computeStyleFactor,
  getHealthStatus,
  computeComponentHealth,
};
