import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function ExchangeTokenPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const jwt = searchParams.get('jwt');
    const name = searchParams.get('name');
    const avatar = searchParams.get('avatar');
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (jwt) {
      localStorage.setItem('token', jwt);
      if (name) localStorage.setItem('user_name', decodeURIComponent(name));
      if (avatar) localStorage.setItem('user_avatar', decodeURIComponent(avatar));
      navigate('/');
      return;
    }

    if (error) {
      console.error('Strava authorization error:', error);
      navigate('/trainings');
      return;
    }

    if (code) {
      // Код авторизации получен, перенаправляем на страницу тренировок
      // Сервер автоматически обработает обмен кода на токен
  
      navigate('/trainings');
    } else {
      // Нет кода, перенаправляем обратно
      navigate('/trainings');
    }
  }, [searchParams, navigate]);

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