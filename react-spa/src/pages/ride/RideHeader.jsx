// Top of the ride analysis modal: route thumbnail (when the ride has a
// polyline), name, date and the activity type badge. The thumbnail is a
// static SVG of the decoded `summary_polyline` — no map tiles, so it needs
// no network and no Leaflet instance inside a dialog.
import React, { useMemo } from 'react';
import { decodeTrack, trackToSvgPath } from './lib';
import styles from './RideAnalysisModal.module.css';

const THUMB_W = 160;
const THUMB_H = 100;

function RouteThumbnail({ summaryPolyline }) {
  const path = useMemo(() => {
    const coords = decodeTrack(summaryPolyline);
    return coords ? trackToSvgPath(coords, THUMB_W, THUMB_H, 8) : '';
  }, [summaryPolyline]);

  if (!path) return null;
  return (
    <svg
      className={styles.routeThumb}
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      width={THUMB_W}
      height={THUMB_H}
      role="img"
      aria-label="Route shape"
      data-testid="route-thumbnail"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RideHeader({ activity, rideDate }) {
  return (
    <header className={styles.header}>
      <RouteThumbnail summaryPolyline={activity.map?.summary_polyline} />
      <div className={styles.headerText}>
        <h3 className={styles.rideName}>{activity.name || 'Ride'}</h3>
        <div className={styles.rideMeta}>
          <span className={styles.rideDate}>{rideDate}</span>
          {activity.type && <span className={styles.typeBadge}>{activity.type}</span>}
        </div>
      </div>
    </header>
  );
}
