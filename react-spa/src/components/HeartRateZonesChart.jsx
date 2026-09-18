import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import ChartErrorBoundary from './ChartErrorBoundary';
import { useHrZonesDistribution } from '../data/hooks';
import './HeartRateZonesChart.css';

// The server only knows these four windows (services/hrZones.js's
// `periodStart`) — see the T-6/audit follow-up report for why this list no
// longer matches the old client-side 4w/8w/12w/6m/all set.
const PERIODS = [
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: '1y', label: '1 year' },
  { value: 'all', label: 'All time' },
];

const METHOD_LABELS = {
  lthr: 'Lactate Threshold based',
  karvonen: 'Karvonen method',
  maxhr: 'Age-based estimation',
};

/**
 * `profile.hr_zones` (T-3.1, docs/audit/layers/04-cross-layer.md §4.4): the
 * server computes zone boundaries via `computeHrZones` and this component
 * only consumes the result — no local zone math. `profile` is a required
 * prop (caller passes whatever already fetched the profile, e.g.
 * `useProfile()`) rather than fetched here.
 *
 * T-6/audit follow-up: the zone *distribution* itself — previously computed
 * here by downloading up to 20 rides' per-activity streams over the
 * network (each one a Strava API call, with no server-side streams cache,
 * so a single Analysis page visit could burn ~20 Strava calls every time)
 * — now comes from `GET /api/analytics/hr-zones`
 * (`useHrZonesDistribution`, T-6.x). This component no longer fetches
 * streams, caches them, or runs `calculateHRZonesDistribution` itself; see
 * `utils/heartRateZones.js` for what stayed (pure helpers still used
 * elsewhere) and what moved server-side.
 *
 * `activities` is kept as a prop only so `AnalysisPage`'s call site (via
 * `MetricSection.jsx`, not owned by this task) doesn't need to change — the
 * distribution itself is now entirely server-driven by `period` + the
 * signed-in user, so this component no longer reads it.
 */
const HeartRateZonesChart = (props) => {
  const { profile } = props; // `props.activities` intentionally unread — see comment above
  const [showTip, setShowTip] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('4w');
  const [activeIndex, setActiveIndex] = useState(null);

  const hrZones = profile?.hr_zones || null;
  const { data, isLoading } = useHrZonesDistribution(selectedPeriod);

  const coverage = data?.coverage || null;
  const coveragePercentage = coverage && coverage.total > 0
    ? Math.round((coverage.withStreams / coverage.total) * 100)
    : 0;

  // Same display reformatting the client-side version always did: the
  // server's plain zone `name` ("Recovery") becomes the "Zone 1 (Recovery)"
  // label this chart has always shown. Zones with no time in them are
  // dropped from the donut, same as before.
  const zoneData = (data?.zones || [])
    .filter((zone) => zone.seconds > 0)
    .map((zone) => ({
      name: `Zone ${zone.id} (${zone.name})`,
      color: zone.color,
      time: +(zone.seconds / 60).toFixed(1),
    }));

  return (
    <div className="gpx-elevation-block" style={{ marginTop: 32, marginBottom: 32, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent:'space-between' }}>
          <h2 style={{ color: '#f6f8ff', margin: 0}}>Load distribution by Heart Rate Zones</h2>
          <div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="settings-btn"
            title="Настройки"
            style={{ marginLeft: 12 }}
          >
            Settings
          </button>
          <span
            style={{
              display: 'inline-block',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#353a44',
              color: '#fff',
              opacity: 0.5,
              fontWeight: 700,
              fontSize: 17,
              textAlign: 'center',
              lineHeight: '22px',
              cursor: 'pointer',
              border: '1.5px solid #444',
              boxShadow: '0 1px 4px #0002',
              marginLeft: 8
            }}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
          >
            ?
          </span>
          {showTip && (
            <div style={{
              position: 'absolute',
              top: 80,
              right: 80,
              background: '#23272f',
              color: '#f6f8ff',
              border: '1.5px solid #7eaaff',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 14,
              zIndex: 10,
              width: 280,
              boxShadow: '0 2px 12px #0005',
              whiteSpace: 'normal'
            }}>
              <div>
                Shows how your training time is distributed across heart rate zones.<br/><br/>
                <strong>Data Sources:</strong><br/>
                • Detailed streams data (1-second intervals) - most accurate<br/>
                • Average HR fallback for activities without streams<br/><br/>
                <strong>Zone Calculation:</strong><br/>
                • Lactate Threshold method (most accurate)<br/>
                • Karvonen method (if Max/Resting HR available)<br/>
                • Age-based estimation (fallback)<br/><br/>
                {coverage && (
                  <div style={{ marginTop: '8px', padding: '6px', background: '#1a1e25', borderRadius: '4px', fontSize: '12px' }}>
                    <strong>Current accuracy:</strong> {coverage.withStreams}/{coverage.total} activities ({coveragePercentage}%) use detailed data
                  </div>
                )}
                <br/>
                Use settings to view current zone calculation details.
              </div>
            </div>
          )}

          </div>
        </div>

      <div style={{ marginBottom: 16 }}>
        <br />
        <label htmlFor="hrz-period-select" style={{ color: '#b0b8c9', fontSize: 14, marginRight: 8 }}>Period:</label>

        <select
          id="hrz-period-select"
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          style={{ padding: '0.3em 0.7em', fontSize: '1em', border: '1px solid #444', background: '#23272f', color: '#fff' }}
        >
          {PERIODS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {coverage && coverage.pending > 0 && (
        <div style={{ color: '#eab308', fontSize: 13, marginBottom: 12 }}>
          {coverage.pending} ride{coverage.pending === 1 ? '' : 's'} still processing — refreshing automatically…
        </div>
      )}

      {showSettings && (
        <div className="chart-settings">
          <div style={{ color: '#b0b8c9', fontSize: 14, marginBottom: '16px' }}>
            <h4 style={{ color: '#f6f8ff', margin: '0 0 8px 0', fontSize: '16px' }}>Heart Rate Zone Settings</h4>

            {hrZones ? (
              <div style={{ background: '#1a1e25', padding: '12px', borderRadius: '6px', border: '1px solid #444' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Max HR:</strong> {hrZones.basis.max_hr} bpm <span style={{ color: '#10b981', fontSize: '12px' }}>✓ from profile</span>
                </div>
                {hrZones.basis.resting_hr && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Resting HR:</strong> {hrZones.basis.resting_hr} bpm <span style={{ color: '#10b981', fontSize: '12px' }}>✓ from profile</span>
                  </div>
                )}
                {hrZones.basis.lactate_threshold && (
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Lactate Threshold:</strong> {hrZones.basis.lactate_threshold} bpm <span style={{ color: '#10b981', fontSize: '12px' }}>✓ from profile</span>
                  </div>
                )}

                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                  <strong>Zone calculation method:</strong> {METHOD_LABELS[hrZones.method] || hrZones.method}
                </div>

                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  To update these values, go to your Profile page → Heart Rate Zones section
                </div>
              </div>
            ) : (
              <div style={{ background: '#1a1e25', padding: '12px', borderRadius: '6px', border: '1px solid #444' }}>
                <div style={{ color: '#f97316', marginBottom: '8px' }}>No profile data available</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Zones will appear once your profile has loaded.
                </div>
              </div>
            )}

            {coverage && (
              <div style={{ background: '#1a1e25', padding: '12px', borderRadius: '6px', border: '1px solid #444', marginTop: '12px' }}>
                <h5 style={{ color: '#f6f8ff', margin: '0 0 8px 0', fontSize: '14px' }}>Data Accuracy</h5>
                <div style={{ marginBottom: '8px', fontSize: '14px' }}>
                  <strong>Activities with detailed data:</strong> {coverage.withStreams}/{coverage.total} ({coveragePercentage}%)
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  {coveragePercentage >= 80 ? (
                    <span style={{ color: '#10b981' }}>✓ Excellent accuracy - most activities use 1-second heart rate data</span>
                  ) : coveragePercentage >= 50 ? (
                    <span style={{ color: '#eab308' }}>⚠ Good accuracy - some activities use average HR fallback</span>
                  ) : (
                    <span style={{ color: '#f97316' }}>⚠ Limited accuracy - many activities use average HR fallback</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                  Detailed data provides second-by-second heart rate analysis for precise zone distribution
                </div>
                {coverage.pending > 0 && (
                  <div style={{ fontSize: '11px', color: '#eab308', marginTop: '6px' }}>
                    {coverage.pending} more activit{coverage.pending === 1 ? 'y is' : 'ies are'} being analyzed in the background — this will update automatically.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {isLoading ? (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Loading...</div>
      ) : zoneData.length > 0 ? (
        <div className="hr-zones-chart-layout">
          <ChartErrorBoundary data={zoneData}>
            <PieChart width={380} height={380}>
              <defs>
                {zoneData.map((entry, index) => (
                  <filter key={index} id={`glow${index}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={entry.color} floodOpacity="0.7"/>
                  </filter>
                ))}
              </defs>
              <Pie
                data={zoneData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={() => ''}
                outerRadius={140}
                innerRadius={80}
                fill="#8884d8"
                dataKey="time"
                paddingAngle={2}
                cornerRadius={8}
                onMouseLeave={() => setActiveIndex(null)}
                onMouseEnter={(_, idx) => setActiveIndex(idx)}
              >
                {zoneData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={activeIndex === index ? entry.color : entry.color + '4D'}
                    stroke={entry.color}
                    strokeWidth={3}
                    strokeOpacity={1}
                    filter={activeIndex === index ? `url(#glow${index})` : undefined}
                    cursor="pointer"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
                formatter={(v) => [v, 'Minutes']}
                labelStyle={{ color: '#f6f8ff' }}
                itemStyle={{ color: '#f6f8ff' }}
                cursor={false}
              />
            </PieChart>
            </ChartErrorBoundary>
          <div className="hr-zones-legend" style={{ minWidth: 140, marginLeft: 12 }}>
            {zoneData.map(zone => (
              <div key={zone.name} style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: zone.color,
                  marginRight: 10
                }} />
                <span style={{ color: '#f6f8ff', fontSize: 14, minWidth: 80 }}>{zone.name}</span>
                <span style={{ color: '#b0b8c9', fontSize: 14, marginLeft: 'auto' }}>{zone.time} min</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Not enough data for heart rate zones</div>
      )}
    </div>
  );
};

export default HeartRateZonesChart;
