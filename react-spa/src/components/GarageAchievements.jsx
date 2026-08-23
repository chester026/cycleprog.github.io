// Achievements strip — first web consumer of /api/achievements/me.
//
// Three most recently unlocked plus three closest to unlocking, as on the app's
// screen. The hexagon is a raster medal asset per tier (not a CSS shape), the
// value/unit inside it are derived from the achievement's `metric` field
// because the API has no unit column, and an unlocked badge shows the green NEW
// pill while a locked one shows its progress bar.
import React from 'react';
import { formatBadgeValue } from '../utils/garageData';
import medalSilver from '../assets/img/achieve/sh_silver.webp';
import medalRareSteel from '../assets/img/achieve/sh_rare_steel.webp';
import medalGold from '../assets/img/achieve/gold.webp';

const MEDALS = {
  silver: medalSilver,
  rare_steel: medalRareSteel,
  gold: medalGold
};

export default function GarageAchievements({ achievements = [], onViewAll }) {
  if (!achievements.length) return null;

  return (
    <>
      <div className="garage-strip">
        {achievements.map(achievement => {
          const tier = MEDALS[achievement.tier] ? achievement.tier : 'silver';
          const { value, unit } = formatBadgeValue(achievement.threshold, achievement.metric);
          const progress = Math.max(0, Math.min(100, Number(achievement.progress_pct) || 0));

          return (
            <div className={`garage-ach-tile tier-${tier}`} key={achievement.id ?? achievement.key}>
              <div className="garage-ach-medal">
                <img src={MEDALS[tier]} alt="" aria-hidden="true" />
                <div className="garage-ach-badge">
                  <div className="garage-ach-value">{value}</div>
                  {unit && <div className="garage-ach-unit">{unit}</div>}
                </div>
              </div>

              <div className="garage-ach-name">{achievement.name}</div>

              {achievement.unlocked ? (
                <span className="garage-ach-new">New</span>
              ) : (
                <div className="garage-ach-progress">
                  <i><b style={{ width: `${progress}%` }} /></i>
                  <span>{progress.toFixed(0)}%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {onViewAll && (
        <button className="garage-view-all" onClick={onViewAll}>View All</button>
      )}
    </>
  );
}
