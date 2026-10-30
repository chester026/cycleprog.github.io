import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { call, auth as authApi } from '../data/api';
import { useAuth } from '../auth/AuthProvider';
import { startStravaLogin } from '../utils/strava';
import { Button } from '../ui';
import './LoginPage.css';
import bikelabLogo from '../assets/img/logo/sign_white.svg';
import stravaIcon from '../assets/img/icons/Stravalogowhite.webp';
import { logError } from '../lib/log';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  useEffect(() => {
    if (searchParams.get('session_expired') === 'true') {
      setError('⏱️ Your session has expired. Please log in again.');
    } else if (searchParams.get('error') === 'strava') {
      setError('Strava sign-in failed or was cancelled. Please try again.');
    }
  }, [searchParams]);

  const handleStravaLogin = async () => {
    try {
      await startStravaLogin();
    } catch (e) {
      logError(e, 'Failed to start Strava login');
      setError('Could not reach Strava. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsVerification(false);
    try {
      const res = await call(authApi.login, { body: { email, password } });
      if (res.needsVerification) {
        setNeedsVerification(true);
        setError('Email not verified. Please check your email and click the verification link.');
        return;
      }

      // Access token in memory, refresh token in localStorage — AuthProvider
      // owns both (T-6.1). No more "remember me" distinction: the refresh
      // token always persists, that's what keeps a browser tab logged in
      // across reloads regardless of this checkbox's old localStorage vs
      // sessionStorage choice.
      await login({ token: res.token, refreshToken: res.refreshToken });
      navigate('/garage');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      await call(authApi.resendVerification, { body: { email } });

      setError('Verification email sent! Please check your inbox.');
      setNeedsVerification(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="login-centered">

      <div className="login-centered-card">
        <img src={bikelabLogo} alt="Bikelab" className="login-hero-logo" />
        <h2 className="login-title">Sign In</h2>
        <button type="button" onClick={handleStravaLogin} className="login-strava-btn">
          <img src={stravaIcon} alt="" className="login-strava-icon" />
          Sign in with Strava
        </button>
        <div className="login-divider">
          <span className="login-divider-line" />
          or
          <span className="login-divider-line" />
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <input type="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} required className="login-input" />
          <input type="password" placeholder="Password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required className="login-input" />
          {error && <div className="login-error">{error}</div>}
          {needsVerification && (
            <Button
              variant="outline"
              block
              onClick={handleResendVerification}
              disabled={resendLoading}
              className="login-resend-btn"
            >
              {resendLoading ? 'Sending...' : 'Resend Verification Email'}
            </Button>
          )}
          <Button type="submit" variant="ghost" block disabled={loading} className="login-submit-btn">
            Sign In
          </Button>
          <div className="login-link">
            No account? <Link to="/register">Register</Link>
          </div>
          <div className="login-link">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
