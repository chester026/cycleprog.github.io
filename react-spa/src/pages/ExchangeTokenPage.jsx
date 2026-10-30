import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOnboarding } from '../contexts/useOnboarding';
import { useAuth } from '../auth/AuthProvider';
import { logError } from '../lib/log';

// Auth code is single-use on the server. React StrictMode (dev) runs effects
// twice and react-router can remount this page, so remember which codes we
// already sent — the second attempt would otherwise get 400 and bounce the
// user to /login?error=strava even though the first one succeeded.
const exchangedCodes = new Set();

export default function ExchangeTokenPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkOnboardingStatus } = useOnboarding();
  const { login } = useAuth();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      logError(error, 'Strava authorization error');
      navigate('/login?error=strava');
      return;
    }

    if (!code) {
      navigate('/login');
      return;
    }

    if (exchangedCodes.has(code)) return;
    exchangedCodes.add(code);

    // The one-time code is exchanged for a real JWT via POST (not via the
    // URL — docs/audit/layers/01-server.md S-07). Plain fetch, not call():
    // there is no token yet; the exchange is public (rate-limited server-side).
    (async () => {
      try {
        const res = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          logError(new Error(data.error || `HTTP ${res.status}`), 'Strava exchange failed');
          navigate('/login?error=strava');
          return;
        }
        const { token, refreshToken } = await res.json();
        // AuthProvider owns the token pair now (T-6.1) — access token in
        // memory, refresh token in localStorage. `login()` also fetches
        // /api/user-profile, so GoalAssistantPage's hero greeting now reads
        // `useAuth().user`/`useProfile()` instead of the `user_name`/
        // `user_avatar` localStorage keys this used to write (T-6.4).
        await login({ token, refreshToken });

        // Tell OnboardingContext a new token is in place.
        window.dispatchEvent(new CustomEvent('tokenUpdated'));

        setTimeout(() => {
          checkOnboardingStatus();
        }, 1500);

        navigate('/garage');
      } catch (e) {
        logError(e, 'Strava exchange error');
        navigate('/login?error=strava');
      }
    })();
    // `exchangedCodes` makes re-runs (login() flipping auth state re-renders
    // this page before navigate('/garage') unmounts it) a no-op.
  }, [searchParams, navigate, login, checkOnboardingStatus]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      flexDirection: 'column',
      gap: '1em'
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #274DD3',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}></div>
      <p>Processing Strava authorization...</p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
