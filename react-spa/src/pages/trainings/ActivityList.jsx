// Activity table (header + year-grouped rows), extracted from
// TrainingsPage (T-6.3, audit W-26). Client-side "show more" pagination:
// the grouped rows can be a few hundred entries for a long Strava history,
// so we render an initial page and grow it on demand instead of mounting
// every row up front.
import React, { useMemo, useState } from 'react';
import { buildRows } from './lib';
import { ActivityRow } from './ActivityRow';

const PAGE_SIZE = 100;

export function ActivityList({ groupedYears, onAiAnalysis, onShowDetails }) {
  const rows = useMemo(() => buildRows(groupedYears), [groupedYears]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset paging when the underlying row set actually changes shape (new
  // filters/year/data), not on every render.
  const rowsKey = rows.length + ':' + (rows[0]?.key ?? '');
  const [lastKey, setLastKey] = useState(rowsKey);
  if (rowsKey !== lastKey) {
    setLastKey(rowsKey);
    setVisibleCount(PAGE_SIZE);
  }

  if (rows.length === 0) {
    return <p className="no-activities">No trainings</p>;
  }

  const visibleRows = rows.length > PAGE_SIZE ? rows.slice(0, visibleCount) : rows;
  const hasMore = visibleRows.length < rows.length;

  return (
    <>
      <div className="activities-table-header">
        <div className="activity-row">
          <div className="activity-name">Activity</div>
          <div className="activity-distance">Distance</div>
          <div className="activity-speed">Avg Speed</div>
          <div className="activity-hr">Avg HR</div>
          <div className="activity-elevation">Elevation</div>
          <div className="activity-actions"></div>
          <div className="activity-details"></div>
        </div>
      </div>

      <div className="activities-table-body">
        {visibleRows.map((row) =>
          row.kind === 'year' ? (
            <div className="year-section-header" key={row.key}>
              <div className="year-title">{row.year}</div>
              <div className="year-count">{row.count} activities</div>
            </div>
          ) : (
            <ActivityRow key={row.key} activity={row.activity} onAiAnalysis={onAiAnalysis} onShowDetails={onShowDetails} />
          )
        )}
      </div>

      {hasMore && (
        <div className="filters-reset" style={{ textAlign: 'center', padding: '16px 0' }}>
          <button className="reset-btn" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Show more ({rows.length - visibleRows.length} more)
          </button>
        </div>
      )}
    </>
  );
}

export default ActivityList;
