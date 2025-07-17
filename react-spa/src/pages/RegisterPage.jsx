import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f8fa' }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 2px 16px #0001', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 28, textAlign: 'center' }}>Регистрация</h2>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ fontSize: 18, padding: 12, borderRadius: 6, border: '1px solid #ddd' }} />
        <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} required style={{ fontSize: 18, padding: 12, borderRadius: 6, border: '1px solid #ddd' }} />
        {error && <div style={{ color: '#d32f2f', textAlign: 'center', fontSize: 15 }}>{error}</div>}
        {success && <div style={{ color: '#388e3c', textAlign: 'center', fontSize: 15 }}>Успешно! Перенаправление...</div>}
        <button type="submit" disabled={loading} style={{ fontSize: 18, padding: 12, borderRadius: 6, background: '#274DD3', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>Зарегистрироваться</button>
        <div style={{ textAlign: 'center', fontSize: 15, marginTop: 8 }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>
      </form>
    </div>
  );
} 