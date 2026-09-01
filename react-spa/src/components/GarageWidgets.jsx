// Garage widget rail: primary bike, best average speed, and the 2x2 metric
// grid (Avg Power / Avg HR / Avg Cadence / VO2max) — the same three items the
// app shows in its horizontal rail. On desktop they fill the column beside the
// ride card; below 1180px the whole block becomes that horizontal rail.
import React, { useState } from 'react';

// trend: rounded diff vs the previous analytics snapshot (see
// computeMetricTrend in garageData.js) — null/0 hides the badge, same rule
// SkillsRadarChart uses for its own +/- badges.
function TrendBadge({ trend }) {
  if (trend === undefined || trend === null || trend === 0) return null;
  return (
    <span className={`garage-metric-trend ${trend > 0 ? 'positive' : 'negative'}`}>
      {trend > 0 ? '+' : ''}{trend}
    </span>
  );
}

function MetricCard({ label, value, unit, sub, trend }) {
  return (
    <div className="garage-metric-card">
      <div className="garage-metric-label-row">
        <div className="garage-metric-label">{label}</div>
        <TrendBadge trend={trend} />
      </div>
      <div>
        <div className="garage-metric-bottom">
          <span className="garage-metric-value">{value}</span>
          {unit && <span className="garage-metric-unit">{unit}</span>}
        </div>
        {sub && <div className="garage-metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function GarageWidgets({ bikes = [], monthly = [], metrics, metricsTrend, onOpenBikes }) {
  const primaryBike = bikes.find(b => b.primary) || bikes[0] || null;
  const [hoverIdx, setHoverIdx] = useState(null);

  // Scale to the highest month but never below 35 km/h, so a weak month does
  // not stretch to full height — same guard as the app.
  const speeds = monthly.map(m => m.speed);
  const maxSpeed = Math.max(...speeds, 35);
  const peak = speeds.length ? Math.max(...speeds) : 0;

  // The bars sit inside a 22px-tall label gutter (garage-speed-bars'
  // padding-bottom), so the target line's own offset has to account for that
  // gutter the same way a bar's height does, or it lands at the wrong height
  // whenever maxSpeed isn't the old hardcoded assumption.
  const targetPct = Math.max(0, Math.min(1, 30 / maxSpeed));
  const targetBottom = `calc(22px + (100% - 22px) * ${targetPct})`;

  const round = v => (typeof v === 'number' && isFinite(v) ? Math.round(v) : null);
  const m = metrics || {};
  const avgPower = round(m.avg_power);
  const avgHr = round(m.avg_hr);
  const avgCadence = round(m.avg_cadence);
  const vo2max = round(m.vo2max);
  const hasAnyMetric = [avgPower, avgHr, avgCadence, vo2max].some(v => v !== null);
  const trend = metricsTrend || {};

  return (
    <div className="garage-widgets">
      {primaryBike && (
        <div
          className="garage-card garage-bike-card"
          onClick={onOpenBikes}
          role={onOpenBikes ? 'button' : undefined}
        >
          <div>
            <span className="garage-pill">Primary</span>
            <div className="garage-bike-name">
              {primaryBike.brand_name && primaryBike.model_name
                ? `${primaryBike.brand_name} ${primaryBike.model_name}`
                : primaryBike.name}
            </div>
          </div>

          {bikes.length > 1 && (
            <span className="garage-bike-all">All bikes →</span>
          )}

          <div>
            {primaryBike.activitiesCount > 0 && (
              <div className="garage-bike-rides">{primaryBike.activitiesCount} rides</div>
            )}
            <div className="garage-bike-odo">
              <b>
                {typeof primaryBike.distanceKm === 'number'
                  ? primaryBike.distanceKm.toLocaleString()
                  : '—'}
              </b>
              <span>km</span>
            </div>
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="garage-card garage-speed-card">
          <div className="garage-speed-big">{peak ? `${peak.toFixed(0)} km/h` : '—'}</div>
          <div className="garage-speed-label">Best avg. speed</div>

          <div className="garage-speed-chart">
            <div className="garage-speed-target" style={{ bottom: targetBottom }}>
              <i />
              <b>30 km/h</b>
            </div>
            <div className="garage-speed-bars">
              {monthly.map((month, i) => (
                <div
                  className="garage-speed-bar-col"
                  key={`${month.label}-${i}`}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <div
                    className={`garage-speed-bar${month.speed === peak && peak > 0 ? ' is-max' : ''}`}
                    style={{ height: `${Math.min(100, (month.speed / maxSpeed) * 100)}%` }}
                  >
                    {hoverIdx === i && (
                      <div className="garage-speed-tooltip">
                        {month.speed ? `${month.speed.toFixed(1)} km/h` : 'No rides'}
                      </div>
                    )}
                  </div>
                  <span>{month.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="garage-metric-grid">
        {hasAnyMetric ? (
          <>
            {avgPower !== null && (
              <MetricCard
                label="Avg Power"
                value={avgPower}
                unit="W"
                sub={round(m.max_power) !== null ? `max ${round(m.max_power)}` : null}
                trend={trend.avg_power}
              />
            )}
            {avgHr !== null && (
              <MetricCard
                label="Avg Heart Rate"
                value={avgHr}
                unit="bpm"
                sub={round(m.max_hr) !== null ? `max ${round(m.max_hr)}` : null}
                trend={trend.avg_hr}
              />
            )}
            {avgCadence !== null && (
              <MetricCard
                label="Avg Cadence"
                value={avgCadence}
                unit="rpm"
                sub={round(m.max_cadence) !== null ? `max ${round(m.max_cadence)}` : null}
                trend={trend.avg_cadence}
              />
            )}
            {vo2max !== null && (
              <MetricCard label="VO2max" value={vo2max} sub="ml/kg/min" />
            )}
          </>
        ) : (
          <div className="garage-metric-empty">
            No power, heart rate or cadence data in your rides yet — connect a
            sensor and the averages will show up here.
          </div>
        )}
      </div>
    </div>
  );
}
