import React from 'react';
import { useAdminStravaLimits, useRefreshStravaLimits } from '../../data/hooks';
import { useConfirm, useToast } from '../../ui';
import { logError } from '../../lib/log';

/**
 * "Strava" admin tab — rate-limit/sync-status diagnostics via
 * `GET /api/strava/limits` + `POST /api/strava/limits/refresh`. T-7.1
 * removed the token-management form that used to live above this: `GET`/
 * `POST /api/strava/tokens` have no server route (see routes.txt) and
 * 404'd forever.
 */
export default function StravaTab() {
  const { data: stravaLimits, refetch: doFetchStravaLimits } = useAdminStravaLimits();
  const refreshStravaLimits = useRefreshStravaLimits();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const fetchStravaLimits = async () => {
    const ok = await confirm({
      title: 'Update limits',
      message: '⚠️ WARNING!\n\nThis action uses Strava API rate limits and may affect the app.\n\nAre you sure you want to update the limits?',
      confirmText: 'Update',
      danger: true,
    });
    if (!ok) return;

    try {
      toast.info('Updating Strava limits (uses API)...');
      await doFetchStravaLimits();
      await refreshStravaLimits.mutateAsync();
      toast.success('Strava limits updated (API used)');
    } catch (e) {
      logError(e, 'Error with Strava limits');
      toast.error(`Error getting Strava limits: ${e.message}`);
    }
  };

  return (
    <div id="strava-tab-block">
      {confirmDialog}
      <h1>Sync Status</h1>

      <div style={{ marginBottom: '2em', padding: '1em', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
        <div style={{ fontSize: '14px', color: '#856404', marginBottom: '8px' }}>
          ℹ️ <strong>Info:</strong> Strava limits are not updated automatically to save API quota. Use button only when needed.
        </div>
        <strong>Strava API Rate Limits:</strong><br />
        {stravaLimits ? (
          <>
            <div>15 min: <b>{stravaLimits.usage15min ?? '—'}</b> / <b>{stravaLimits.limit15min ?? '—'}</b></div>
            <div>Day: <b>{stravaLimits.usageDay ?? '—'}</b> / <b>{stravaLimits.limitDay ?? '—'}</b></div>
            <div style={{ fontSize: '12px', color: '#888' }}>Last updated: {stravaLimits.lastUpdate ? new Date(stravaLimits.lastUpdate).toLocaleString('en-GB') : '—'}</div>
          </>
        ) : (
          <span style={{ color: '#888' }}>No data - click update to load (uses API)</span>
        )}
        <button type="button"
          onClick={fetchStravaLimits}
          className="admin-btn"
          style={{ marginLeft: 16, fontSize: 12, background: '#dc3545', color: '#fff' }}
          title="⚠️ WARNING: Uses Strava API rate limits!"
        >
          ⚠️ Update Limits (Uses API!)
        </button>
      </div>
    </div>
  );
}
