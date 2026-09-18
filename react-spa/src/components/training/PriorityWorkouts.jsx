import React from 'react';
import TrainingCard from '../TrainingCard';

/**
 * The "AI-Generated" view's Training Center (T-6.3, audit W-21): the top-4
 * priority workout cards, plus the static Recovery Strategy / Recovery
 * Ride / Group Ride / "More Trainings" section. Extracted verbatim from
 * WeeklyTrainingCalendar's `renderTrainingCenter`.
 */
export function PriorityWorkouts({ grouped, onHowToRide, onOpenLibrary }) {
  return (
    <div className="training-center">
      <div className="training-section">
        <div className="priority-grid">
          {grouped.mostRecommended && (
            <TrainingCard
              key={`most-recommended-${grouped.mostRecommended.day}-${grouped.mostRecommended.trainingType}`}
              cardId={`training-most-recommended-${grouped.mostRecommended.trainingType}`}
              cardClass="priority-workout-card most-recommended-card"
              title={grouped.mostRecommended.name}
              description={grouped.mostRecommended.recommendation}
              intensity={grouped.mostRecommended.details?.intensity}
              duration={grouped.mostRecommended.details?.duration}
              trainingType={grouped.mostRecommended.trainingType}
              size="normal"
              variant="most-recommended"
              showBadge={true}
              badgeText="Most Recommended"
              onClick={() => onHowToRide(grouped.mostRecommended)}
            />
          )}

          {grouped.priority.map((training, index) => (
            <TrainingCard
              key={`priority-${training.day}-${training.trainingType}`}
              cardId={`training-priority-${index + 1}-${training.trainingType}`}
              cardClass={`priority-workout-card priority-card-${index + 1}`}
              title={training.name}
              description={training.recommendation}
              intensity={training.details?.intensity}
              duration={training.details?.duration}
              trainingType={training.trainingType}
              size="normal"
              variant="priority"
              showBadge={true}
              badgeText="Recommended"
              onClick={() => onHowToRide(training)}
            />
          ))}
        </div>
      </div>

      <div className="training-section secondary-section">
        <div className="secondary-grid">
          <div className="recovery-card-wrapper">
            <div className="recovery-strategy-card">
              <div>
                <div className="training-card-badge">
                  <span className="material-symbols-outlined">auto_awesome</span>
                  <span>AI-powered feature</span>
                </div>
                <h3>Recovery Strategy</h3>
                <p>
                  Smart recovery recommendations based on your training load and progress. AI-powered analysis
                  coming soon.
                </p>
              </div>
              <button className="training-card-btn">Will be available soon</button>
            </div>
            <span className="material-symbols-outlined"> health_and_safety</span>
          </div>

          <div className="preferable-more-wrapper">
            <div className="preferable-grid">
              <TrainingCard
                title="Recovery Ride"
                description="Easy spinning for active recovery"
                intensity="50-65% FTP"
                duration="45"
                trainingType="recovery"
                size="small"
                variant="preferable"
                showBadge={true}
                badgeText="+ Preferable"
                onClick={() =>
                  onHowToRide({
                    name: 'Recovery',
                    type: 'recovery',
                    trainingType: 'recovery',
                    recommendation: 'Easy spinning for active recovery',
                    details: {
                      intensity: '50-65% FTP',
                      duration: '45 min',
                      cadence: '70-80 rpm',
                      hr_zones: 'Z1-Z2',
                      benefits: ['Accelerate recovery', 'Improve blood circulation'],
                    },
                  })
                }
              />

              <TrainingCard
                title="Group Ride"
                description="Social training with variable intensity"
                intensity="70-90% FTP"
                duration="120"
                trainingType="group_ride"
                size="small"
                variant="preferable"
                showBadge={true}
                badgeText="+ Preferable"
                onClick={() =>
                  onHowToRide({
                    name: 'Group Ride',
                    type: 'group_ride',
                    trainingType: 'group_ride',
                    recommendation: 'Social training with variable intensity',
                    details: {
                      intensity: '70-90% FTP',
                      duration: '120 min',
                      cadence: '80-95 rpm',
                      hr_zones: 'Z2-Z4',
                      benefits: ['Develop group riding skills', 'Social aspect of training'],
                    },
                  })
                }
              />

              <div className="more-trainings-card" onClick={onOpenLibrary}>
                <div>
                  <h3>More Trainings</h3>
                  <p>If you feel frustrating about recomended trainings you can find many more here</p>
                </div>
                <span className="training-card-btn">EXPLORE MORE →</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PriorityWorkouts;
