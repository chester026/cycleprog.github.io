import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChangeEmail, useDeleteAccount } from '../../data/hooks';
import { useAuth } from '../../auth/AuthProvider';
import { useConfirm, useToast } from '../../ui';
import { isApiError } from '../../utils/api';

/**
 * ProfilePage's "Account Settings" tab (T-6.3 decomposition): email change
 * and account deletion.
 *
 * Email used to be just another field in the page-wide `profile` draft,
 * saved by the same PUT /api/user-profile as everything else — that PUT
 * updates `users.email` with no verification and no conflict check at all
 * (`repositories/userProfile.js#setEmail`). It now goes through its own
 * `POST /api/user-profile/email` (T-4.5/S-27: normalises the address,
 * re-verifies it, and 409s with `code: 'EMAIL_TAKEN'` on conflict instead
 * of silently overwriting), with its own Save action.
 *
 * Account deletion (`DELETE /api/account`) is new here — the SPA had no UI
 * for it at all before this; see BikeLabApp/src/screens/ProfileScreen.tsx's
 * `handleDeleteAccount` for the mobile equivalent this mirrors.
 */
export default function AccountDangerZone({ profile }) {
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const changeEmail = useChangeEmail();
  const deleteAccount = useDeleteAccount();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();

  const [email, setEmail] = useState(profile?.email || '');
  const [emailError, setEmailError] = useState(null);

  // Keep the field in sync if the profile query refetches with a different
  // (e.g. server-normalised) address after this component already mounted.
  useEffect(() => {
    setEmail(profile?.email || '');
  }, [profile?.email]);

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    setEmailError(null);
    if (!email || !email.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      const res = await changeEmail.mutateAsync(email);
      // Mints a fresh access token (the email just changed) but no new
      // refresh token — login() updates only the in-memory access token
      // (T-6.1) and leaves the existing refresh token alone.
      if (res.token) await login({ token: res.token });
      toast.success(res.message || 'Email updated. Please check your inbox to verify your new address.');
    } catch (error) {
      if (isApiError(error) && error.code === 'EMAIL_TAKEN') {
        toast.error('This email is already used by another account.');
      } else {
        console.error('Error updating email:', error);
        toast.error('Failed to update email. Please try again.');
      }
    }
  };

  const handleDeleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete account',
      message: 'This permanently deletes your account and all its data. This cannot be undone.',
      confirmText: 'Delete account',
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteAccount.mutateAsync();
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Failed to delete account. Please try again.');
    }
  };

  return (
    <div className="profile-section">
      <h2>Account Settings</h2>
      <form className="form-grid" onSubmit={handleChangeEmail}>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
          />
          {emailError && <span className="error">{emailError}</span>}
          <p className="field-hint">Used for account recovery and notifications</p>
        </div>
        <div className="profile-actions">
          <button type="submit" className="accent-btn" disabled={changeEmail.isPending}>
            {changeEmail.isPending ? 'Saving...' : 'Change Email'}
          </button>
        </div>
      </form>

      <div className="danger-zone">
        <h3>Danger Zone</h3>
        <p className="field-hint">Deleting your account permanently removes your data and cannot be undone.</p>
        <button type="button" className="danger-btn" onClick={handleDeleteAccount} disabled={deleteAccount.isPending}>
          {deleteAccount.isPending ? 'Deleting...' : 'Delete Account'}
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}
