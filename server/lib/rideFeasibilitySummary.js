// One-line, units-explicit digest of a computeRideFeasibility result for the coach. The model
// reads this first and quotes it, so every number carries its unit and nothing needs converting.

function ago(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 90) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const pct = (ratio) => `${Math.round(ratio * 100)}%`;

function capabilitySentence({ level, ratioDistance, ratioElevation }) {
  if (level === 'done') return 'Capability: done (a ride in the last year already covered 95%+ of both distance and climbing).';
  const ratios = `distance ${pct(ratioDistance)}, climbing ${ratioElevation === null ? 'n/a' : pct(ratioElevation)} of PBs`;
  return `Capability: ${level} (${ratios}).`;
}

/** @param {import('@bikelab/shared/calc').RideFeasibility} f */
function buildFeasibilitySummary(f) {
  const { target, personalBests: pb, capability, load, comparableRides } = f;
  const head = `Target ${target.distanceKm} km / ${target.elevationM} m on ${target.date}.`;
  if (!pb) return `${head} No synced rides to compare with, so capability and freshness cannot be judged.`;

  const parts = [
    head,
    `Longest ride ${pb.longestRide.distanceKm} km (${ago(pb.longestRide.daysAgo)}), biggest climb ${pb.biggestClimb.elevationM} m (${ago(pb.biggestClimb.daysAgo)}).`,
  ];
  if (comparableRides[0]) {
    const c = comparableRides[0];
    parts.push(`Closest comparable ride: ${c.distanceKm} km / ${c.elevationM} m, ${c.movingTimeH} h, ${ago(c.daysAgo)}.`);
  }
  parts.push(capabilitySentence(capability));

  const loadBits = [`7d ${load.last7d.hours} h (${load.last7d.km} km)`];
  loadBits[0] += load.acuteChronicRatio === null
    ? ', no chronic baseline'
    : ` vs chronic ${load.chronicWeeklyAvg.hours} h/week (ACR ${load.acuteChronicRatio})`;
  loadBits.push(load.daysSinceLastRide === null ? 'no ride in the load window' : `last ride ${ago(load.daysSinceLastRide)}`);
  loadBits.push(load.daysSinceLastLongRide === null ? 'no 100+ km ride yet' : `last 100+ km ride ${ago(load.daysSinceLastLongRide)}`);
  parts.push(`Load: ${loadBits.join(', ')}.`);
  parts.push(`Freshness: ${f.freshness}.`);
  return parts.join(' ');
}

module.exports = { buildFeasibilitySummary };
