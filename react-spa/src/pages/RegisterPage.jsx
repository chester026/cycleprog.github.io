import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './LoginPage.css';
import bannerImg from '../assets/img/banner_bg.png';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      setSuccess(true);
      setTimeout(() => navigate('/login', { state: { registered: true } }), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      <div className="login-container">
        {/* Left column with image */}
        <div className="login-image" style={{ backgroundImage: `url(${bannerImg})` }}>
          <div className="login-image-text">
            <h1 className="login-image-title">BIKELAB <span className="login-app-span">.app</span></h1>
          </div>
        </div>
        {/* Right column with form */}
        <div className="login-form-block">
          <form onSubmit={handleSubmit} className="login-form">
            <h2 className="register-title">Sign Up</h2>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="register-input login-input" />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="register-input login-input" />
            <input type="password" placeholder="Repeat password" value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} required className="register-input login-input" />
            {error && <div className="register-error login-error">{error}</div>}
            {success && <div style={{ color: '#388e3c', textAlign: 'center', fontSize: 15 }}>Success! Redirecting...</div>}
            <button type="submit" disabled={loading} className="accent-btn" style={{ width: '100%', opacity: loading ? 0.7 : 1 }}>
              Sign Up
            </button>
            <div className="register-link login-link">
              Already have an account? <Link to="/login">Sign In</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 