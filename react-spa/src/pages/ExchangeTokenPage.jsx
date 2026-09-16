import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOnboarding } from '../contexts/OnboardingContext';

// Auth code is single-use on the server. React StrictMode (dev) runs effects
// twice and react-router can remount this page, so remember which codes we
// already sent — the second attempt would otherwise get 400 and bounce the
// user to /login?error=strava even though the first one succeeded.
const exchangedCodes = new Set();

export default function ExchangeTokenPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkOnboardingStatus } = useOnboarding();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('Strava authorization error:', error);
      navigate('/login?error=strava');
      return;
    }

    if (!code) {
      // Нет кода — просто уходим обратно, ждать тут нечего.
      navigate('/login');
      return;
    }

    if (exchangedCodes.has(code)) return;
    exchangedCodes.add(code);

    // Одноразовый код меняем на реальный JWT через POST-запрос (не через
    // URL — см. docs/audit/layers/01-server.md S-07). Обычный fetch, без
    // apiFetch: токена ещё нет, обмен публичный (rate-limited на сервере).
    (async () => {
      try {
        const res = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error('Strava exchange failed:', data.error);
          navigate('/login?error=strava');
          return;
        }
        const { token, user } = await res.json();
        localStorage.setItem('token', token);
        if (user?.name) localStorage.setItem('user_name', user.name);
        if (user?.avatar) localStorage.setItem('user_avatar', user.avatar);

        // Уведомляем OnboardingContext о новом токене
        window.dispatchEvent(new CustomEvent('tokenUpdated'));

        setTimeout(() => {
          checkOnboardingStatus();
        }, 1500);

        navigate('/garage');
      } catch (e) {
        console.error('Strava exchange error:', e);
        navigate('/login?error=strava');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <p>Обработка авторизации Strava...</p>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
