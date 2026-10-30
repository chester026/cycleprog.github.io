import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LastRideBanner from './LastRideBanner';
import './Sidebar.css';
import { proxyStravaImage } from '../utils/imageProxy';
import { startStravaLink } from '../utils/strava';
import { useAuth } from '../auth/AuthProvider';
import { logError } from '../lib/log';
import bl_logo from '../assets/img/logo/bl_logo.png';

// `match` lists every path prefix the item is "active" for — the coach item
// covers the chat routes and the goal detail pages, which have no entry of
// their own.
const navItems = [
  { to: '/garage', label: 'Bike Garage', match: ['/garage'] },
  { to: '/coach', label: 'Coach', icon: 'auto_awesome', match: ['/coach', '/goals'] },
  { to: '/calendar', label: 'Calendar', icon: 'calendar_month', match: ['/calendar'] },
  { to: '/analysis', label: 'Analysis', match: ['/analysis'] },
  { to: '/maintenance', label: 'Maintenance', match: ['/maintenance'] },
  { to: '/trainings', label: 'Activities', match: ['/trainings'] },
  { to: '/checklist', label: 'Checklist', match: ['/checklist'] },
];

const SIDEBAR_ID = 'app-sidebar';

function isActive(item, pathname) {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function Sidebar() {
  const location = useLocation();
  const isMainPage = location.pathname === '/garage';
  const navigate = useNavigate();
  // user/name/avatar/strava_id come from GET /api/user-profile via
  // AuthProvider (T-6.1) — no more decoding the JWT ourselves.
  const { user, isLoading, logout, refreshProfile } = useAuth();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const firstLinkRef = useRef(null);

  const stravaId = user?.strava_id || null;
  const userName = user?.name || null;
  const userAvatar = user?.avatar || null;
  const userDataLoaded = !isLoading;

  useEffect(() => {
    // After the Strava OAuth redirect (not a popup — the server sends the
    // browser back to /profile?strava=linked|error, see GET /link_strava)
    // the profile (strava_id/avatar) changed server-side: re-read it instead
    // of decoding a token that didn't change.
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'linked') {
      params.delete('strava');
      window.history.replaceState({}, '', window.location.pathname);
      refreshProfile();
    }

    // The Strava connect popup posts back when the link completes.
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === 'strava-linked') {
        refreshProfile();
      }
    };

    // Onboarding completion updates the profile; the short delay lets the
    // server finish writing before the re-read.
    const handleOnboardingComplete = (event) => {
      if (event.detail?.tokenUpdated) {
        setTimeout(() => {
          refreshProfile();
        }, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('onboardingComplete', handleOnboardingComplete);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('onboardingComplete', handleOnboardingComplete);
    };
  }, [refreshProfile]);

  const handleLogout = () => {
    // `logout()` runs every registered cleanup (QueryProvider registers
    // `clearQueryCache`), so there is no per-user localStorage to clean here.
    logout();
    navigate('/login');
  };

  const handleConnectStrava = async () => {
    try {
      await startStravaLink();
    } catch (e) {
      logError(e, 'Failed to start Strava link');
    }
  };

  const closeMenu = () => setIsMobileMenuOpen(false);

  // The drawer closes on navigation…
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // …and on Escape; focus moves to the first link when it opens so a
  // keyboard user lands inside it.
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    firstLinkRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <>
      <button
        type="button"
        className={`mobile-menu-toggle ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileMenuOpen}
        aria-controls={SIDEBAR_ID}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {isMobileMenuOpen && <div className="mobile-overlay" role="presentation" onClick={closeMenu} />}

      <aside id={SIDEBAR_ID} className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`} data-testid="sidebar">
        <nav aria-label="Main">
          <div className="main-logo-text">
            <img src={bl_logo} alt="BikeLab" />
            <span className="main-logo-span">bikelab.app</span>
          </div>

          <ul>
            {navItems.map((item, index) => (
              <li key={item.to}>
                <Link
                  ref={index === 0 ? firstLinkRef : undefined}
                  to={item.to}
                  className={isActive(item, location.pathname) ? 'active' : ''}
                  aria-current={isActive(item, location.pathname) ? 'page' : undefined}
                  onClick={closeMenu}
                >
                  {item.icon ? (
                    <span className="sidebar-link-icon material-symbols-outlined" aria-hidden="true">
                      {item.icon}
                    </span>
                  ) : null}
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {isMainPage && (
          <p className="sidebar-hint">
            Go to the <b>Coach</b> page to set your training goals.
          </p>
        )}
        {!isMainPage && <LastRideBanner />}
        <div className="sidebar-spacer" />
        <div className="user-aside-container">
          {userDataLoaded && !stravaId ? (
            <button type="button" className="sidebar-connect-strava" onClick={handleConnectStrava}>
              Connect Strava
            </button>
          ) : userDataLoaded && stravaId ? (
            userName && (
              <button
                type="button"
                className="sidebar-user-block sidebar-user-block-btn"
                onClick={() => navigate('/profile')}
              >
                {userAvatar ? (
                  <img
                    src={proxyStravaImage(userAvatar)}
                    alt={userName}
                    className="sidebar-user-avatar"
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="sidebar-user-avatar sidebar-user-initial"
                  style={{ display: userAvatar ? 'none' : 'flex' }}
                >
                  {userName[0]}
                </div>
                <div className="sidebar-user-name">{userName}</div>
              </button>
            )
          ) : !userDataLoaded ? (
            <div className="sidebar-user-loading">Loading...</div>
          ) : null}
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            data-testid="logout-button"
            aria-label="Log out"
          >
            <i className="sign-out-icon material-symbols-outlined" aria-hidden="true">
              logout
            </i>
          </button>
        </div>
      </aside>
    </>
  );
}
