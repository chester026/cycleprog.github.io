// Bike health computation (T-4.1 domain extraction). Moved verbatim from
// server.js — see routes/bikes.js for the routes that use these.
//
// `BIKE_COMPONENTS` is `@bikelab/shared/constants`'s single source of truth
// (T-2.4, docs/audit/00-AUDIT-AND-PLAN.md, docs/audit/layers/04-cross-layer.md
// §4.9/§6.1), shared with the web's MaintenancePage.jsx label maps —
// re-exported here so routes/bikes.js and server.js's AI-coach wiring
// (`getBikeComponents`) both go through this one module.
const { BIKE_COMPONENTS } = require('@bikelab/shared/constants');

// TODO(T-4.1): computeRidingStyle is dead code in the pre-extraction
// server.js — nothing calls it (GET /api/bikes/:bikeId/health derives
// `ridingStyle` from the latest skills_history row instead, via
// determineRiderProfile's inputs). Moved verbatim, unused, to keep
// behaviour identical; flagging in case removing it was actually intended.
function computeRidingStyle(activities) {
  if (!activities || activities.length === 0) {
    return { climbing: 0, sprint: 0, power: 0 };
  }

  // Climbing score: elevation density (m per 100km)
  const ridesWithElevation = activities.filter(a => a.total_elevation_gain > 0 && a.distance > 0);
  let climbingScore = 0;
  if (ridesWithElevation.length > 0) {
    const densities = ridesWithElevation.map(a => (a.total_elevation_gain / (a.distance / 1000)) * 100);
    const medianDensity = densities.sort((a, b) => a - b)[Math.floor(densities.length / 2)];
    // Scale: 200 m/100km = 0, 3000 m/100km = 100
    climbingScore = Math.min(100, Math.max(0, ((medianDensity - 200) / 2800) * 100));
  }

  // Sprint score: max speed variability
  const flatRides = activities.filter(a => {
    const distKm = a.distance / 1000;
    const elevPerKm = distKm > 0 ? a.total_elevation_gain / distKm : 0;
    const avgSpeedKmh = (a.average_speed || 0) * 3.6;
    return elevPerKm < 10 && distKm > 10 && avgSpeedKmh >= 22;
  });
  let sprintScore = 0;
  if (flatRides.length > 0) {
    const maxSpeeds = flatRides.map(a => (a.max_speed || 0) * 3.6);
    const medianMax = maxSpeeds.sort((a, b) => a - b)[Math.floor(maxSpeeds.length / 2)];
    // Scale: 30 km/h = 0, 65 km/h = 100
    sprintScore = Math.min(100, Math.max(0, ((medianMax - 30) / 35) * 100));
  }

  // Power score: average watts
  const withPower = activities.filter(a => a.average_watts > 0);
  let powerScore = 0;
  if (withPower.length > 0) {
    const avgWatts = withPower.reduce((s, a) => s + a.average_watts, 0) / withPower.length;
    // Scale: 80W = 0, 300W = 100
    powerScore = Math.min(100, Math.max(0, ((avgWatts - 80) / 220) * 100));
  }

  return {
    climbing: Math.round(climbingScore),
    sprint: Math.round(sprintScore),
    power: Math.round(powerScore),
  };
}

// determineRiderProfile is `@bikelab/shared/calc`'s canonical (app-variant)
// implementation (T-3.3, docs/audit/00-AUDIT-AND-PLAN.md T-3.3) — this used
// to be a local duplicate missing only the `description` field; the app's
// variant won per the product decision, see that module's doc.

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
  computeRidingStyle,
  computeStyleFactor,
  getHealthStatus,
  computeComponentHealth,
};
