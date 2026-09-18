import React from 'react';
import { useUnlinkStrava } from '../../data/hooks';
import { useConfirm, useToast } from '../../ui';
import { startStravaLink } from '../../utils/strava';

/**
 * ProfilePage's "Strava Integration" tab (T-6.3 decomposition, W-21/W-23:
 * `window.confirm`/`alert` replaced with `useConfirm`/`useToast`).
 */
export default function IntegrationsCard({ profile, onUnlinked }) {
  const unlinkStrava = useUnlinkStrava();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const handleUnlinkStrava = async () => {
    const ok = await confirm({
      title: 'Unlink Strava',
      message: 'Are you sure you want to unlink your Strava account?',
      confirmText: 'Unlink',
      danger: true,
    });
    if (!ok) return;

    try {
      await unlinkStrava.mutateAsync();
      toast.success('Strava account unlinked successfully!');
      onUnlinked?.();
    } catch (error) {
      console.error('Error unlinking Strava:', error);
      toast.error('Failed to unlink Strava account. Please try again.');
    }
  };

  const handleLinkStrava = async () => {
    try {
      // Previously used the LOGIN redirect (/exchange_token) — that logs the
      // user into whatever account is attached to that Strava id instead of
      // linking Strava to the account they're already in. See
      // docs/audit/layers/02-bikelabapp.md A-01 (same bug, mobile side).
      await startStravaLink();
    } catch (e) {
      console.error('Failed to start Strava link:', e);
    }
  };

  return (
    <div className="profile-section">
      <h2>Strava Integration</h2>
      <div className="strava-section">
        <p>Connect your Strava account to automatically sync your activities and get personalized recommendations.</p>

        <div className="strava-actions">
          {profile.strava_id ? (
            <div className="strava-connected">
              <p className="strava-status">✅ Strava account connected</p>
              <button className="accent-btn" onClick={handleUnlinkStrava} disabled={unlinkStrava.isPending}>
                {unlinkStrava.isPending ? 'Unlinking...' : 'Unlink Strava'}
              </button>
            </div>
          ) : (
            <button className="strava-link-button accent-btn" onClick={handleLinkStrava}>
              Connect Strava
            </button>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
