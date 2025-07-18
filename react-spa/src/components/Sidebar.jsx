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
    sessionStorage.removeItem('token');
    navigate('/login');
  };

  const userName = localStorage.getItem('user_name');
  const userAvatar = localStorage.getItem('user_avatar');

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <nav>
        <h2 className="main-logo-text">BIKELAB<span className="main-logo-span">.app</span></h2>
       
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
      <div style={{ flex: 0.95 }} />
      {userName && (
        <div className="sidebar-user-block">
          {userAvatar ? (
            <img src={userAvatar} alt={userName} className="sidebar-user-avatar" />
          ) : (
            <div className="sidebar-user-avatar sidebar-user-initial">
              {userName[0]}
            </div>
          )}
          <div className="sidebar-user-name">{userName}</div>
        </div>
      )}
      <button
        onClick={handleLogout}
        style={{
          margin: '24px 16px 16px 16px',
          padding: '12px 0',
          width: 'calc(100% - 32px)',
          border: 'none',
         
          
          fontWeight: 600,
          fontSize: '0.8em',
          cursor: 'pointer',
       
          transition: 'background 0.2s',
        }}
      >
        Выйти
      </button>
    </aside>
  );
} 