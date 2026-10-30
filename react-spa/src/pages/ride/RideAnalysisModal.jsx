// Ride analysis modal — the web counterpart of the app's RideAnalytics
// screen, opened from the Garage hero's "Analyze ride" and every Trainings
// row. Streams and goal progress load through TanStack Query hooks while the
// summary fields come from the activity already on the page; the ride math
// is `@bikelab/shared/calc`'s rideAnalysis, shared with the app.
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { computeRideAnalysis, formatRideDate, rideCoachPrompt } from '@bikelab/shared/calc';
import { Modal, Button } from '../../ui';
import { useProfile, useActivityStreams, useActivityMetaGoalsProgress } from '../../data/hooks';
import RideHeader from './RideHeader';
import RideStats from './RideStats';
import StreamsCharts from './StreamsCharts';
import { coachUrlForRide } from './lib';
import styles from './RideAnalysisModal.module.css';

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
    <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zm6 11l.9 2.6L21.5 16.5l-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9L18 13zM5 14l.7 2 2 .7-2 .7L5 19.5l-.7-2.1-2-.7 2-.7L5 14z" />
  </svg>
);

function queryState(query) {
  if (query.isLoading) return 'loading';
  if (query.error) return 'error';
  return 'ready';
}

export default function RideAnalysisModal({ open, onClose, activity }) {
  const navigate = useNavigate();
  const activityId = open && activity ? activity.id : undefined;

  const profileQuery = useProfile();
  const streamsQuery = useActivityStreams(activityId);
  const metaGoalsQuery = useActivityMetaGoalsProgress(activityId);

  const rideDate = useMemo(() => (activity?.start_date ? formatRideDate(activity.start_date) : ''), [activity?.start_date]);

  const { hrZoneDistribution, rideQuality } = useMemo(
    () =>
      activity
        ? computeRideAnalysis(streamsQuery.data ?? null, profileQuery.data ?? null, activity)
        : { hrZoneDistribution: [], rideQuality: null },
    [streamsQuery.data, profileQuery.data, activity],
  );

  const handleDiscuss = () => {
    onClose?.();
    navigate(coachUrlForRide(rideCoachPrompt(activity, rideDate), activity.id));
  };

  const handleOpenGoal = (goalId) => {
    onClose?.();
    navigate(`/goals/${goalId}`);
  };

  if (!activity) {
    return (
      <Modal open={open} onClose={onClose} title="Ride Analytics" className={styles.sheet}>
        <div className={styles.placeholder}>No ride to analyse yet</div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ride Analytics"
      className={styles.sheet}
      footer={
        <Button variant="primary" className={styles.discussButton} onClick={handleDiscuss}>
          <SparkleIcon />
          Discuss with Coach
        </Button>
      }
    >
      <RideHeader activity={activity} rideDate={rideDate} />
      <RideStats
        activity={activity}
        rideQuality={rideQuality}
        hrZoneDistribution={hrZoneDistribution}
        metaGoals={metaGoalsQuery.data ?? []}
        goalsState={queryState(metaGoalsQuery)}
        onOpenGoal={handleOpenGoal}
        chartsSlot={
          <StreamsCharts
            streams={streamsQuery.data ?? null}
            isLoading={streamsQuery.isLoading}
            error={streamsQuery.error}
            activity={activity}
          />
        }
      />
    </Modal>
  );
}
