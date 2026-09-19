import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { isApiError } from '../utils/api';
import { call, auth } from '../data/api';
import './LoginPage.css';

// POST /api/reset-password {token, password} (T-4.5) — token comes from the
// `?token=` link forgot-password emailed out (see server/brevo-config.js's
// resetUrl, which points at this exact path).
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== repeatPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await call(auth.resetPassword, { body: { token, password } });
      setSuccess(true);
    } catch (e) {
      setError(isApiError(e) && e.code === 'INVALID_TOKEN' ? 'This reset link is invalid or has expired.' : e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="login-centered">
        <div className="login-centered-card">
          <h2 className="login-title">Reset Password</h2>
          <div className="login-error">Invalid or missing reset link.</div>
          <div className="login-link">
            <Link to="/forgot-password">Request a new link</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-centered">
      <div className="login-centered-card">
        <h2 className="login-title">Reset Password</h2>
        {success ? (
          <>
            <div style={{ color: '#388e3c', textAlign: 'center', fontSize: 15, marginBottom: '1em' }}>
              Password reset successful! You can now log in with your new password.
            </div>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="login-submit-btn"
            >
              Go to Login
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <input
              type="password"
              placeholder="New password"
              aria-label="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="login-input"
            />
            <input
              type="password"
              placeholder="Repeat new password"
              aria-label="Repeat new password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              required
              className="login-input"
            />
            {error && <div className="login-error">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="login-submit-btn"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Saving...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
