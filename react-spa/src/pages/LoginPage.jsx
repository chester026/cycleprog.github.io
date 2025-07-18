import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './LoginPage.css';
import bannerImg from '../assets/img/banner_bg.png';
import stravaLogo from '../assets/img/icons/strava.svg'; // если есть иконка Strava, иначе убрать

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      if (rememberMe) {
        localStorage.setItem('token', data.token);
      } else {
        sessionStorage.setItem('token', data.token);
      }
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      <div className="login-container">
        {/* Левая колонка с изображением */}
        <div className="login-image" style={{ backgroundImage: `url(${bannerImg})` }}>
          <div className="login-image-text">
            <h1 className="login-image-title">BIKELAB <span className="login-app-span">.app</span></h1>
          </div>
        </div>
        {/* Правая колонка с формой */}
        <div className="login-form-block">
          <form onSubmit={handleSubmit} className="login-form">
            <h2 className="login-title">Вход</h2>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="login-input" />
            <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required className="login-input" />
            <label className="login-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              Запомнить меня
            </label>
            {error && <div className="login-error">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="accent-btn"
              style={{ width: '100%', opacity: loading ? 0.7 : 1 }}
            >
              Войти
            </button>
            <a
              href={`https://www.strava.com/oauth/authorize?client_id=165560&response_type=code&redirect_uri=${encodeURIComponent(window.location.origin + '/exchange_token')}&scope=activity:read_all,profile:read_all&approval_prompt=auto`}
              className="strava-btn"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, textDecoration: 'none', fontWeight: 600, fontSize: 18 }}
            >
              {/* <img src={stravaLogo} alt="Strava" style={{ height: 24 }} /> */}
              <span style={{ color: '#fc4c02' }}>Войти через Strava</span>
            </a>
            <div className="login-link">
              Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 