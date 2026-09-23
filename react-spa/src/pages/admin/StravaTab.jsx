import React from 'react';
import { useAdminStravaLimits, useRefreshStravaLimits } from '../../data/hooks';
import { useConfirm, useToast } from '../../ui';

/**
 * "Strava" admin tab — rate-limit/sync-status diagnostics (T-6.3, split out
 * of AdminPage.jsx) via `GET /api/strava/limits` + `POST
 * /api/strava/limits/refresh`. Also keeps the unrelated Power Analysis
 * localStorage cache section carried over from the old "Cache" tab. T-7.1
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
      console.error('Error with Strava limits:', e);
      toast.error(`Error getting Strava limits: ${e.message}`);
    }
  };

  const getPowerAnalysisCacheInfo = () => {
    try {
      const powerCacheKeys = Object.keys(localStorage).filter(
        (key) =>
          key.startsWith('powerAnalysis_') ||
          key.includes('_75_8_asphalt_wind_v') ||
          key.includes('_75_8_asphalt_nowind_v')
      );
      return { size: powerCacheKeys.length, hasData: powerCacheKeys.length > 0, keys: powerCacheKeys };
    } catch {
      return { size: 0, hasData: false, keys: [] };
    }
  };

  const clearPowerAnalysisCache = () => {
    try {
      const powerCacheKeys = Object.keys(localStorage).filter(
        (key) =>
          key.startsWith('powerAnalysis_') ||
          key.includes('_75_8_asphalt_wind_v') ||
          key.includes('_75_8_asphalt_nowind_v')
      );
      powerCacheKeys.forEach((key) => localStorage.removeItem(key));
      toast.success(`Power Analysis cache cleared (${powerCacheKeys.length} items)`);
    } catch {
      toast.error('Error clearing Power Analysis cache');
    }
  };

  const powerCacheInfo = getPowerAnalysisCacheInfo();

  return (
    <div id="strava-tab-block">
      {confirmDialog}
      <h1>Sync Status &amp; Cache</h1>

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
        <button
          onClick={fetchStravaLimits}
          className="admin-btn"
          style={{ marginLeft: 16, fontSize: 12, background: '#dc3545', color: '#fff' }}
          title="⚠️ WARNING: Uses Strava API rate limits!"
        >
          ⚠️ Update Limits (Uses API!)
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8f9fa' }}>
            <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Data Type</th>
            <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Status</th>
            <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Last Updated</th>
            <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #dee2e6' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
              <strong>Power Analysis Cache</strong>
            </td>
            <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
              <span style={{ color: powerCacheInfo.hasData ? '#28a745' : '#6c757d', fontWeight: 'bold' }}>
                {powerCacheInfo.hasData ? `✓ ${powerCacheInfo.size} power calculations cached` : '✗ No power calculations cached'}
              </span>
            </td>
            <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>—</td>
            <td style={{ padding: '12px', border: '1px solid #dee2e6' }}>
              {powerCacheInfo.hasData && (
                <button
                  onClick={clearPowerAnalysisCache}
                  className="admin-btn"
                  style={{ background: '#ffc107', color: '#000', fontSize: '12px' }}
                >
                  Clear
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
