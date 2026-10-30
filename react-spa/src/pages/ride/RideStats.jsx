// Web port of the app's RideAnalytics/RideStats: the Ride Quality block,
// the metrics grid, the stream charts slot, the HR-zone bars and the
// "Impact on Goals" cards — same order, same copy.
import React from 'react';
import { rideQualityColor } from '@bikelab/shared/calc';
import { TIER_CONFIG } from '@bikelab/shared/constants';
import { rideMetrics } from './lib';
import styles from './RideAnalysisModal.module.css';

// A goal can have six sub-goals and six "+0.2 W" rows are a wall of
// numbers, not an insight — three rows, then the card points at the goal.
const MAX_CONTRIBUTIONS = 3;

const RING_SIZE = 54;
const RING_STROKE = 4.5;

function GoalRing({ value }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <svg className={styles.goalRing} width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
      <circle className={styles.goalRingTrack} cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} strokeWidth={RING_STROKE} fill="none" />
      <circle
        className={styles.goalRingValue}
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radius}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
      <text className={styles.goalRingText} x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {Math.round(value)}%
      </text>
    </svg>
  );
}

function GoalCard({ goal, onOpenGoal }) {
  const contributions = goal.contributions ?? [];
  const hiddenContributions = Math.max(0, contributions.length - MAX_CONTRIBUTIONS);
  const tier = goal.tier || 'base';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.base;
  const isBase = tier === 'base';

  return (
    <button type="button" className={styles.goalCard} onClick={() => onOpenGoal(goal.id)}>
      <div className={styles.goalHeader}>
        <GoalRing value={goal.progress} />
        <span className={styles.goalTitle}>{goal.title}</span>
        {(goal.progressGain ?? 0) > 0 && <span className={styles.goalGain}>+{goal.progressGain}%</span>}
      </div>
      {contributions.length > 0 && (
        <ul className={styles.contributions}>
          {contributions.slice(0, MAX_CONTRIBUTIONS).map((contrib, idx) => (
            <li key={idx} className={styles.contribution}>
              <span className={styles.contributionLabel}>{contrib.label}</span>
              <span className={styles.contributionValue}>{contrib.value}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.goalFooter}>
        <span
          className={[styles.tierBadge, isBase ? styles.tierBadgeBase : null].filter(Boolean).join(' ')}
          style={isBase ? undefined : { background: tierCfg.color }}
        >
          {tierCfg.label}
        </span>
        {hiddenContributions > 0 && <span className={styles.goalMore}>+{hiddenContributions} more ›</span>}
      </div>
    </button>
  );
}

export default function RideStats({ activity, rideQuality, hrZoneDistribution, metaGoals, goalsState, chartsSlot, onOpenGoal }) {
  const metrics = rideMetrics(activity);

  return (
    <>
      {rideQuality && (
        <section className={styles.qualityBlock}>
          <div className={styles.qualityHeader} style={{ color: rideQualityColor(rideQuality.quality) }}>
            <span className={styles.qualityDot} aria-hidden="true" />
            {rideQuality.label}
          </div>
          <div className={styles.qualityScore}>
            Ride Quality: {rideQuality.quality}
            <span className={styles.qualityOf}>/100</span>
          </div>
          <p className={styles.qualityAdvice}>{rideQuality.advice}</p>
        </section>
      )}

      {metrics.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Metrics</h4>
          <dl className={styles.metricsGrid}>
            {metrics.map((m) => (
              <div key={m.label} className={styles.metric}>
                <dt className={styles.metricLabel}>{m.label}</dt>
                <dd className={styles.metricValue}>{m.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {chartsSlot}

      {hrZoneDistribution.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>HR Zones</h4>
          <ul className={styles.zoneList}>
            {hrZoneDistribution.map((z) => (
              <li key={z.zone} className={styles.zoneRow}>
                <span className={styles.zoneLabel}>
                  {z.zone} {z.rangeMin}-{z.rangeMax}
                </span>
                <span className={styles.zoneTrack}>
                  <span className={styles.zoneFill} style={{ width: `${Math.max(z.percent, 2)}%`, background: z.color }} />
                </span>
                <span className={styles.zonePercent}>{z.percent}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Impact on Goals</h4>
        {goalsState === 'loading' && <div className={styles.placeholder}>Loading goals…</div>}
        {goalsState === 'error' && <div className={styles.placeholder}>Could not load goal progress</div>}
        {goalsState === 'ready' &&
          (metaGoals.length > 0 ? (
            <div className={styles.goalList}>
              {metaGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} onOpenGoal={onOpenGoal} />
              ))}
            </div>
          ) : (
            <div className={styles.placeholder}>No active goals found</div>
          ))}
      </section>
    </>
  );
}
