import React from 'react';
import { useDeviceBrand } from '../data/hooks';

// T-6.4 (audit W-18): device-brand detection moved to `useDeviceBrand()`
// (src/data/hooks/useDeviceBrand.js), replacing the localStorage
// `device_${brandKey}_${userId}` TTL cache + manual apiFetch loop this
// component used to run itself.
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
  activities = [], // used to detect the recording device
  deviceBrand = '', // explicit brand, skips detection
  showOnlyForBrands = [] // e.g. ['Garmin'] to render only for those brands
}) {
  const [currentOpacity, setCurrentOpacity] = React.useState(opacity);

  const hasExplicitBrand = Boolean(deviceBrand);
  const explicitMatches = hasExplicitBrand
    && showOnlyForBrands.some((brand) => deviceBrand.toLowerCase().includes(brand.toLowerCase()));

  const { shouldShow: detectedShouldShow, deviceName: detectedDeviceName } = useDeviceBrand(
    activities,
    hasExplicitBrand ? [] : showOnlyForBrands,
  );

  const shouldShow = !showOnlyForBrands || showOnlyForBrands.length === 0
    ? true
    : (hasExplicitBrand ? explicitMatches : detectedShouldShow);
  const deviceName = hasExplicitBrand ? '' : detectedDeviceName;

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
