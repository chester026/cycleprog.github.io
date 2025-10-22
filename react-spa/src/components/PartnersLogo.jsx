import React from 'react';
import { apiFetch } from '../utils/api';
import { cacheUtils } from '../utils/cache';
import { jwtDecode } from 'jwt-decode';

export default function PartnersLogo({ 
  logoSrc, 
  alt = 'Partner Logo', 
  className = '', 
  style = {},
  height = '30px',
  position = 'absolute',
  top = '16px',
  right = '19px',
  opacity = 1,
  hoverOpacity = 1,
  zIndex = 10,
  filterEffect = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
  activities = [], // Массив активностей для определения устройства
  deviceBrand = '', // Напрямую передать бренд устройства
  showOnlyForBrands = [] // Показывать только для определенных брендов (например, ['Garmin'])
}) {
  const [currentOpacity, setCurrentOpacity] = React.useState(opacity);
  const [shouldShow, setShouldShow] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const [deviceName, setDeviceName] = React.useState('');

  // Получить userId из токена
  const getUserId = () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return null;
    try {
      const decoded = jwtDecode(token);
      return decoded.userId;
    } catch {
      return null;
    }
  };

  // Проверяем устройства в активностях
  React.useEffect(() => {
    const checkDevices = async () => {
      // Если нет ограничений по брендам, показываем всегда
      if (!showOnlyForBrands || showOnlyForBrands.length === 0) {
        setShouldShow(true);
        return;
      }

      // Если передан бренд напрямую
      if (deviceBrand) {
        const matches = showOnlyForBrands.some(brand => 
          deviceBrand.toLowerCase().includes(brand.toLowerCase())
        );
        setShouldShow(matches);
        return;
      }

      // Проверяем последние активности
      if (activities && activities.length > 0 && !isChecking) {
        setIsChecking(true);
        
        const userId = getUserId();
        const brandKey = showOnlyForBrands.join('_').toLowerCase();
        const cacheKey = userId ? `device_${brandKey}_${userId}` : `device_${brandKey}`;
        
        // Проверяем кэш
        const cachedDevice = cacheUtils.get(cacheKey);
        if (cachedDevice) {
          setDeviceName(cachedDevice.name);
          setShouldShow(cachedDevice.shouldShow);
          setIsChecking(false);
          return;
        }
        
        try {
          // Берем первые 3 активности для детальной проверки
          const recentActivities = activities.slice(0, 3);
          
          for (const activity of recentActivities) {
            try {
              // Запрашиваем детальную информацию об активности
              const detailedActivity = await apiFetch(`/api/activities/${activity.id}`);
              
              if (detailedActivity.device_name) {
                const deviceMatch = showOnlyForBrands.some(brand =>
                  detailedActivity.device_name.toLowerCase().includes(brand.toLowerCase())
                );
                
                if (deviceMatch) {
                  // Убираем название бренда из названия устройства
                  let cleanDeviceName = detailedActivity.device_name;
                  showOnlyForBrands.forEach(brand => {
                    const regex = new RegExp(`^${brand}\\s+`, 'i');
                    cleanDeviceName = cleanDeviceName.replace(regex, '');
                  });
                  
                  // Сохраняем в кэш на 24 часа
                  cacheUtils.set(cacheKey, { 
                    name: cleanDeviceName, 
                    shouldShow: true 
                  }, 24 * 60 * 60 * 1000);
                  
                  setDeviceName(cleanDeviceName);
                  setShouldShow(true);
                  setIsChecking(false);
                  return;
                }
              }
            } catch (error) {
              // Продолжаем проверку следующих активностей
            }
          }
          
          // Сохраняем отрицательный результат в кэш на 1 час
          cacheUtils.set(cacheKey, { 
            name: '', 
            shouldShow: false 
          }, 60 * 60 * 1000);
          
          setShouldShow(false);
        } catch (error) {
          console.error('Error checking devices:', error);
          setShouldShow(false);
        } finally {
          setIsChecking(false);
        }
      } else if (!activities || activities.length === 0) {
        setShouldShow(false);
      }
    };

    checkDevices();
  }, [activities, deviceBrand, showOnlyForBrands]); // eslint-disable-line react-hooks/exhaustive-deps

  // Не рендерим компонент, если не нужно показывать
  if (!shouldShow) {
    return null;
  }

  return (
    <div 
      className={`partners-logo ${className}`}
      style={{
        position,
        top,
        right,
        opacity: currentOpacity,
        transition: 'opacity 0.3s ease',
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0px',
        ...style
      }}
      onMouseEnter={() => setCurrentOpacity(hoverOpacity)}
      onMouseLeave={() => setCurrentOpacity(opacity)}
    >
       
      <img 
        src={logoSrc} 
        alt={alt} 
        style={{
          height,
          width: 'auto',
          filter: filterEffect
        }}
      />
        {deviceName && (
        <span 
          style={{
            fontSize: '8px',
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            fontWeight: '700',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            
          }}
        >
          {deviceName}
        </span>
      )}
     
    </div>
  );
}

