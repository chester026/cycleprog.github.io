import { Link, useLocation, useNavigate } from 'react-router-dom';
import LastRideBanner from './LastRideBanner';
import './Sidebar.css';

const navItems = [
  { to: '/', label: 'Bike garage' },
  { to: '/nutrition', label: 'Питание' },
  { to: '/trainings', label: 'Тренировки' },
  { to: '/plan', label: 'Анализ и план' },
  { to: '/checklist', label: 'Чек-листы' },
];

export default function Sidebar() {
  const location = useLocation();
  const isMainPage = location.pathname === '/';
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav>
        <ul>
          {navItems.map(item => (
            <li key={item.to}>
              <Link 
                to={item.to} 
                className={location.pathname === item.to ? 'active' : ''}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {isMainPage && (
        <div style={{
          fontSize: '13px',
          fontWeight: 400,
          color: '#333',
          opacity: 0.5,
          marginTop: '1.5em',
          lineHeight: '21px',
          padding: '16px'
        }}>
          Перейдите на вкладку <b>Тренировки</b>, чтобы получить и выгрузить свои данные.
        </div>
      )}
      {!isMainPage && <LastRideBanner />}
      <div style={{ flex: 1 }} />
      <button
        onClick={handleLogout}
        style={{
          margin: '24px 16px 16px 16px',
          padding: '12px 0',
          width: 'calc(100% - 32px)',
          border: 'none',
          borderRadius: 6,
          background: '#f7f8fa',
          color: '#d32f2f',
          fontWeight: 600,
          fontSize: 16,
          cursor: 'pointer',
          boxShadow: '0 1px 4px #0001',
          transition: 'background 0.2s',
        }}
      >
        Выйти
      </button>
    </aside>
  );
} 