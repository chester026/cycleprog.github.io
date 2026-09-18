import React from 'react';
import DatabaseMemoryInfo from './DatabaseMemoryInfo';

/**
 * "Database" admin tab (T-6.3, split out of AdminPage.jsx). Thin wrapper —
 * all the actual reporting/optimize UI lives in `DatabaseMemoryInfo`
 * (moved here from `src/components/` per T-6.3's file ownership).
 */
export default function DatabaseTab() {
  return (
    <div id="database-tab-block">
      <DatabaseMemoryInfo />
    </div>
  );
}
