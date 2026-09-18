import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './LoginPage.css';

// POST /api/forgot-password (T-4.5, A-05: no user enumeration) — the server
// always answers 200 whether or not the email belongs to an account, so
// this page shows the same message either way.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-centered">
      <div className="login-centered-card">
        <h2 className="login-title">Forgot Password</h2>
        {sent ? (
          <div style={{ color: '#388e3c', textAlign: 'center', fontSize: 15, marginBottom: '1em' }}>
            If an account with that email exists, a password reset link has been sent. Please check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
        <div className="login-link">
          <Link to="/login">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
