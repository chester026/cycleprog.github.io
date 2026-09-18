import React, { useState } from 'react';
import {
  useAdminStravaTokens,
  useAdminStravaLimits,
  useSaveStravaTokens,
  useRefreshStravaLimits,
  useAdminUsers,
  useAdminHeroImages,
} from '../../data/hooks';
import { useConfirm, useToast, Loader } from '../../ui';

/**
 * "Strava" admin tab — API tokens, rate limits/sync status (T-6.3, split
 * out of AdminPage.jsx). Merges the former "API Keys" and "Cache" tabs
 * (both were Strava-adjacent: token form + Strava rate-limit sync status);
 * the unrelated Power Analysis localStorage cache section lived under the
 * old "Cache" tab too and is kept here rather than dropped.
 */
export default function StravaTab() {
  const { data: stravaTokensData, isLoading } = useAdminStravaTokens();
  const { data: stravaLimits, refetch: doFetchStravaLimits } = useAdminStravaLimits();
  const saveStravaTokens = useSaveStravaTokens();
  const refreshStravaLimits = useRefreshStravaLimits();
  const { data: usersData } = useAdminUsers();
  const { data: heroImagesData } = useAdminHeroImages();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const [stravaTokens, setStravaTokens] = useState({ access_token: '', refresh_token: '', expires_at: '' });
  const [tokensSeeded, setTokensSeeded] = useState(false);
  if (stravaTokensData && !tokensSeeded) {
    setTokensSeeded(true);
    setStravaTokens(stravaTokensData);
  }

  const handleStravaTokensSubmit = async (e) => {
    e.preventDefault();
    try {
      await saveStravaTokens.mutateAsync(stravaTokens);
      toast.success('Strava API keys updated!');
    } catch (err) {
      console.error('Error saving Strava tokens:', err);
      toast.error('Error saving keys: ' + err.message);
    }
  };

  const clearStravaTokens = async () => {
    const ok = await confirm({ title: 'Clear tokens', message: 'Clear all Strava tokens?', confirmText: 'Clear' });
    if (!ok) return;
    setStravaTokens({ access_token: '', refresh_token: '', expires_at: '' });
    toast.info('Strava tokens cleared');
  };

  const fetchStravaLimits = async () => {
    const ok = await confirm({
      title: 'Update limits',
      message: '⚠️ ВНИМАНИЕ!\n\nЭто действие использует лимиты Strava API и может повлиять на работу приложения.\n\nВы уверены, что хотите обновить лимиты?',
      confirmText: 'Update',
      danger: true,
    });
    if (!ok) return;

    try {
      toast.info('Обновляем лимиты Strava (использует API)...');
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

  const exportData = () => {
    const data = {
      stravaTokens,
      heroImages: heroImagesData || {},
      users: usersData || [],
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cycleprog-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Data exported!');
  };

  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        if (data.stravaTokens) {
          const ok = await confirm({ title: 'Import data', message: 'Import data? This may overwrite existing data.', confirmText: 'Import' });
          if (ok) {
            setStravaTokens(data.stravaTokens);
            toast.success('Strava tokens imported!');
          }
        }
      } catch (err) {
        toast.error('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const powerCacheInfo = getPowerAnalysisCacheInfo();

  if (isLoading) {
    return (
      <div id="api-tab-block">
        {confirmDialog}
        <Loader label="Loading Strava settings..." />
      </div>
    );
  }

  return (
    <div id="api-tab-block">
      {confirmDialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>Manage Strava API Keys</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="admin-btn" onClick={exportData} style={{ background: '#28a745' }}>
            📤 Export
          </button>
          <label className="admin-btn" style={{ background: '#17a2b8', cursor: 'pointer' }}>
            📥 Import
            <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
      <div style={{ marginBottom: '1em', padding: '1em', background: '#f8f9fa', borderRadius: '4px', border: '1px solid #e9ecef' }}>
        <strong>Instructions:</strong><br />
        1. Get keys in <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">Strava API settings</a><br />
        2. Enter access_token and refresh_token<br />
        3. expires_at - token expiration time (timestamp)<br />
        4. Click "Save Keys"
      </div>

      <form onSubmit={handleStravaTokensSubmit}>
        <label>Access Token:<br />
          <input
            type="text"
            value={stravaTokens.access_token}
            onChange={(e) => setStravaTokens({ ...stravaTokens, access_token: e.target.value })}
            placeholder="Enter access token"
            style={{ width: '100%', maxWidth: '400px' }}
            required
          />
        </label><br /><br />

        <label>Refresh Token:<br />
          <input
            type="text"
            value={stravaTokens.refresh_token}
            onChange={(e) => setStravaTokens({ ...stravaTokens, refresh_token: e.target.value })}
            placeholder="Enter refresh token"
            style={{ width: '100%', maxWidth: '400px' }}
            required
          />
        </label><br /><br />

        <label>Expires At (timestamp):<br />
          <input
            type="number"
            value={stravaTokens.expires_at}
            onChange={(e) => setStravaTokens({ ...stravaTokens, expires_at: e.target.value })}
            placeholder="Enter expiration timestamp"
            style={{ width: '100%', maxWidth: '400px' }}
            required
          />
        </label><br /><br />

        <button type="submit" className="admin-btn">Save Keys</button>
        <button type="button" onClick={clearStravaTokens} className="admin-btn" style={{ marginLeft: '1em', background: '#6c757d' }}>
          Clear
        </button>
      </form>

      {stravaTokens.access_token && (
        <div style={{ marginTop: '2em', padding: '1em', background: '#e8f5e8', borderRadius: '4px', border: '1px solid #28a745' }}>
          <strong>Current Keys:</strong><br />
          Access Token: {stravaTokens.access_token.substring(0, 10)}...<br />
          Refresh Token: {stravaTokens.refresh_token.substring(0, 10)}...<br />
          Expires At: {stravaTokens.expires_at ? new Date(stravaTokens.expires_at * 1000).toLocaleString('ru-RU') : 'Not specified'}
        </div>
      )}

      <h1 style={{ marginTop: '2em' }}>Sync Status &amp; Cache</h1>

      <div style={{ marginBottom: '2em', padding: '1em', background: '#fff3cd', borderRadius: '4px', border: '1px solid #ffeaa7' }}>
        <div style={{ fontSize: '14px', color: '#856404', marginBottom: '8px' }}>
          ℹ️ <strong>Info:</strong> Strava limits are not updated automatically to save API quota. Use button only when needed.
        </div>
        <strong>Strava API Rate Limits:</strong><br />
        {stravaLimits ? (
          <>
            <div>15 min: <b>{stravaLimits.usage15min ?? '—'}</b> / <b>{stravaLimits.limit15min ?? '—'}</b></div>
            <div>Day: <b>{stravaLimits.usageDay ?? '—'}</b> / <b>{stravaLimits.limitDay ?? '—'}</b></div>
            <div style={{ fontSize: '12px', color: '#888' }}>Last updated: {stravaLimits.lastUpdate ? new Date(stravaLimits.lastUpdate).toLocaleString('ru-RU') : '—'}</div>
          </>
        ) : (
          <span style={{ color: '#888' }}>No data - click update to load (uses API)</span>
        )}
        <button
          onClick={fetchStravaLimits}
          className="admin-btn"
          style={{ marginLeft: 16, fontSize: 12, background: '#dc3545', color: '#fff' }}
          title="⚠️ ВНИМАНИЕ: Использует Strava API лимиты!"
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
