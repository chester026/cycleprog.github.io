import { Link, useLocation } from 'react-router-dom';
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
  
  return (
    <aside className="sidebar">
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
    </aside>
  );
} 