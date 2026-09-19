// T-6.5 (audit W-?? landing hygiene): split out of LandingPage.jsx. Fixed
// side nav + hero section. `navTone`/`activeNav` are computed by the parent
// page's scrollspy effect (it needs to query every `[data-lp-tone]` section,
// which live across all four landing/* pieces) and passed down here so the
// dot color/active state stay correct without duplicating that effect.
import { Link } from 'react-router-dom';
import bikelabLogo from '../../assets/img/logo/sign_white.svg';
import heroRiderPhoto from '../../assets/img/trainings/mostrecomended.png';
import stravaIcon from '../../assets/img/icons/Stravalogowhite.webp';

const NAV_DOTS = [
  { key: 'home', href: '#home', title: 'Home' },
  { key: 'garage', href: '#features', title: 'Garage' },
  { key: 'ai-coach', href: '#ai-coach', title: 'AI Coach' },
  { key: 'analytics', href: '#analytics', title: 'Analytics' },
  { key: 'calendar', href: '#calendar', title: 'Calendar' },
  { key: 'sharing', href: '#sharing', title: 'Sharing' },
  { key: 'components', href: '#components', title: 'Components' },
  { key: 'integrations', href: '#integrations', title: 'Integrations' },
  { key: 'testimonials', href: '#testimonials', title: 'Testimonials' },
  { key: 'faq', href: '#faq', title: 'FAQ' }
];

// Dot color per background "tone" behind the fixed side nav at any given
// scroll position - black on light sections, blue on dark sections, white
// on the solid blue AI Coach section.
const NAV_TONE_COLOR = {
  light: 'var(--lp-blue-500)',
  dark: '#fff',
  blue: '#fff'
};

// Fixed side nav — rendered outside <main> by the page (a persistent
// landmark, not page content), so it's exported separately from the hero
// section itself.
export function LandingNav({ navTone, activeNav }) {
  return (
    <nav className="lp-dotnav" aria-label="Section navigation" style={{ '--lp-dotnav-color': NAV_TONE_COLOR[navTone] }}>
      {NAV_DOTS.map(dot => (
        <a
          key={dot.key}
          href={dot.href}
          aria-label={dot.title}
          className={`lp-dotnav-dot${activeNav === dot.key ? ' is-active' : ''}`}
        >
          <span className="lp-dotnav-label">{dot.title}</span>
          <span className="lp-dotnav-bar" />
        </a>
      ))}
    </nav>
  );
}

export function Hero({ onStravaLogin }) {
  return (
      <section id="home" className="lp-hero" aria-label="Hero introduction" data-lp-tone="dark" data-lp-nav="home">
        <div className="lp-blob lp-blob--hero-1" />
        <div className="lp-blob lp-blob--hero-2" />

        <div className="lp-hero-photo" style={{ backgroundImage: `url(${heroRiderPhoto})` }}>
          <div className="lp-hero-photo-scrim" />
          <div className="lp-hero-headline">
            <div className="lp-hero-headline-line">Ultimate</div>
            <div className="lp-hero-headline-line">way to</div>
            <div className="lp-hero-headline-line lp-hero-headline-line--accent">analyse</div>
            <div className="lp-hero-headline-line">your</div>
            <div className="lp-hero-headline-line">rides</div>
            <div className="lp-hero-headline-line" style={{ marginBottom: 18 }}>smarter.</div>
            <p className="lp-hero-tagline">powered by the AI coach in your pocket</p>
          </div>
        </div>

        <div className="lp-hero-content">
          <img src={bikelabLogo} alt="Bikelab" className="lp-hero-logo" />
          <p className="lp-p" style={{ color: '#ccc', maxWidth: 350 }}>
            Welcome! Bikelab turns every ride into training plans, bike maintenance alerts, and long-term progress you can actually see.
          </p>
          <p className="lp-p" style={{ color: 'oklch(0.6 0.015 264)', maxWidth: 350 }}>
            Off the bike, it keeps an eye on your recovery and readiness too.
          </p>
          <div className="lp-hero-ctas">
            <button type="button" onClick={onStravaLogin} className="lp-btn lp-btn--strava">
              <img src={stravaIcon} alt="" className="lp-btn-strava-icon" />
              Sign in with Strava
            </button>
            <a href="#download" className="lp-btn lp-btn--primary">Download on the App Store</a>

            <Link to="/login" className="lp-btn lp-btn--ghost">Continue with login</Link>
          </div>
          <div className="lp-hero-fine">Free to start · Syncs with Strava in one tap</div>
        </div>
      </section>
  );
}
