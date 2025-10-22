import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { jwtDecode } from 'jwt-decode';
import './LoginPage.css';
import bannerImg from '../assets/img/banner_bg.png';
import stravaLogo from '../assets/img/icons/strava.svg'; // если есть иконка Strava, иначе убрать
import bl_logo from '../assets/img/logo/bl_logo_white.png';
import StravaLogo from '../components/StravaLogo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsVerification(false);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.needsVerification) {
        setNeedsVerification(true);
        setError('Email not verified. Please check your email and click the verification link.');
        return;
      }
      
      // Очищаем кэши старого пользователя перед логином нового
      const oldToken = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (oldToken) {
        try {
          const oldDecoded = jwtDecode(oldToken);
          const oldUserId = oldDecoded.userId;
          if (oldUserId) {
            // Очищаем кэши старого пользователя
            localStorage.removeItem(`cycleprog_cache_activities_${oldUserId}`);
            localStorage.removeItem(`cycleprog_cache_bikes_${oldUserId}`);
            localStorage.removeItem(`cycleprog_cache_garage_images_${oldUserId}`);
            localStorage.removeItem(`cycleprog_cache_device_garmin_${oldUserId}`);
          }
        } catch (e) {
          // Игнорируем ошибки декодирования старого токена
        }
      }
      
      // Сохраняем новый токен
      if (rememberMe) {
        localStorage.setItem('token', res.token);
      } else {
        sessionStorage.setItem('token', res.token);
      }
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      const res = await apiFetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      setError('Verification email sent! Please check your inbox.');
      setNeedsVerification(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="login-root">
      <div className="login-container">
        {/* Левая колонка с изображением */}
        <div className="login-image" style={{ backgroundImage: `url(${bannerImg})`, position: 'relative' }}>
        <div className="main-logo-text">
          <img src={bl_logo} alt="BikeLab" />
         
        </div>
        <span className="login-image-main-logo-span">bikelab.app</span>
        <StravaLogo style={{
          position: 'absolute',
          top: '32px',
          right: '24px'
         
        }} />
        </div>
        {/* Правая колонка с формой */}
        <div className="login-form-block">
          <form onSubmit={handleSubmit} className="login-form">
            <h2 className="login-title">Sign In</h2>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="login-input" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="login-input" />
            <label className="login-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              Remember me
            </label>
            {error && <div className="login-error">{error}</div>}
            {needsVerification && (
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendLoading}
                style={{
                  background: 'none',
                  border: '1px solid #274DD3',
                  color: '#274DD3',
                  padding: '12px',
                  cursor: 'pointer',
                  width: '100%',
                  marginTop: '10px',
                  opacity: resendLoading ? 0.7 : 1
                }}
              >
                {resendLoading ? 'Sending...' : 'Resend Verification Email'}
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="accent-btn"
              style={{ width: '100%', opacity: loading ? 0.7 : 1 }}
            >
              Sign In
            </button>
            <div className="divider">
                <dir className='line'></dir>
                <div>Или используй Strava</div>
                <dir className='line'></dir>
            </div>
            <a
              href={`https://www.strava.com/oauth/authorize?client_id=165560&response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/exchange_token')}&scope=activity:read_all,profile:read_all&approval_prompt=auto`}
              className="strava-btn"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, textDecoration: 'none', fontWeight: 500, fontSize: '0.9em', background: 'rgb(37 31 33)',border: '1px solid #973c1c', padding: '11px 0' }}
            >
             <span style={{ color: '#fff', display:'flex', alignItems: 'center', gap:'8px' }}> <img className="strava-logo" src={stravaLogo} alt="" /><span>Sign-in with Strava</span></span>
            </a>
            <div className="login-link">
              No account? <Link to="/register">Register</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 