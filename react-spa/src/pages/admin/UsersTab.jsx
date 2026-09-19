import React from 'react';
import {
  useAdminUsers,
  useUnlinkAdminUserStrava,
  useDeleteAdminUser,
} from '../../data/hooks';
import { useConfirm, useToast, Loader } from '../../ui';

/**
 * "Users" admin tab — list, unlink Strava, delete (T-6.3, split out of the
 * 852-line AdminPage.jsx). `window.confirm` calls are replaced by
 * `useConfirm` (danger styling on the destructive delete) per GUIDE-6.md;
 * the old inline notification banners are replaced by `useToast`.
 */
export default function UsersTab() {
  const { data: usersData, isLoading } = useAdminUsers();
  const users = usersData || [];
  const unlinkAdminUserStrava = useUnlinkAdminUserStrava();
  const deleteAdminUser = useDeleteAdminUser();
  const [confirm, confirmDialog] = useConfirm();
  const toast = useToast();

  const formatDT = (dt) => new Date(dt).toLocaleString('en-GB');

  const unlinkUserStrava = async (userId, userEmail) => {
    const ok = await confirm({
      title: 'Unlink Strava',
      message: `Unlink Strava from ${userEmail}?`,
      confirmText: 'Unlink',
    });
    if (!ok) return;

    try {
      await unlinkAdminUserStrava.mutateAsync(userId);
      toast.success(`Strava unlinked from ${userEmail}`);
    } catch (err) {
      toast.error(`Failed to unlink Strava: ${err.message}`);
    }
  };

  const deleteUser = async (userId, userEmail) => {
    const ok = await confirm({
      title: 'Delete user',
      message: `WARNING! This will permanently delete user ${userEmail} and ALL related data (activities, goals, events, profile). This action cannot be undone!\n\nContinue?`,
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    try {
      const response = await deleteAdminUser.mutateAsync(userId);

      let message = `User ${userEmail} deleted`;
      if (response.deletedRecords) {
        const totalDeleted = Object.values(response.deletedRecords).reduce((sum, count) => sum + count, 0);
        message += ` (${totalDeleted} records deleted)`;
      }

      toast.success(message);
    } catch (err) {
      toast.error(`Failed to delete user: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div id="users-tab-block">
        {confirmDialog}
        <Loader label="Loading users..." />
      </div>
    );
  }

  return (
    <div id="users-tab-block">
      {confirmDialog}
      <div className="admin-section">
        <h2>👥 User Management</h2>
        <p>Manage application users, unlink Strava accounts, and delete users with all related data.</p>

        <div className="users-stats">
          <div className="stat-item">
            <span className="stat-label">Total Users:</span>
            <span className="stat-value">{users.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Email Verified:</span>
            <span className="stat-value">{users.filter((u) => u.email_verified).length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">With Strava:</span>
            <span className="stat-value">{users.filter((u) => u.has_strava_token).length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Without Strava:</span>
            <span className="stat-value">{users.filter((u) => !u.has_strava_token).length}</span>
          </div>
        </div>

        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Verified</th>
                <th>Strava ID</th>
                <th>Level</th>
                <th>Rides</th>
                <th>Goals</th>
                <th>Events</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={`${!user.has_strava_token ? 'user-no-strava' : ''} ${!user.email_verified ? 'user-unverified' : ''}`.trim()}>
                  <td>{user.id}</td>
                  <td className="user-email">{user.email}</td>
                  <td className="user-verified">
                    {user.email_verified ? (
                      <span className="verified-yes">✓</span>
                    ) : (
                      <span className="verified-no">✗</span>
                    )}
                  </td>
                  <td className="user-strava">
                    {user.strava_id ? (
                      <span className="strava-connected">{user.strava_id}</span>
                    ) : (
                      <span className="strava-disconnected">Not connected</span>
                    )}
                  </td>
                  <td className="user-level">
                    <span className={`level-badge level-${user.experience_level || 'unknown'}`}>
                      {user.experience_level || '—'}
                    </span>
                  </td>
                  <td className="user-count">{user.rides_count || 0}</td>
                  <td className="user-count">{user.goals_count || 0}</td>
                  <td className="user-count">{user.events_count || 0}</td>
                  <td className="user-date">{user.created_at ? formatDT(user.created_at) : '—'}</td>
                  <td className="user-actions">
                    {user.has_strava_token && (
                      <button
                        className="user-action-btn unlink-btn"
                        onClick={() => unlinkUserStrava(user.id, user.email)}
                        title="Unlink Strava"
                      >
                        🔗
                      </button>
                    )}
                    <button
                      className="user-action-btn delete-btn"
                      onClick={() => deleteUser(user.id, user.email)}
                      title="Delete User"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="no-users">
              <p>No users found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
