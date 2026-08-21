import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';
import bikelabLogo from '../assets/img/logo/sign_white.svg';
import heroRiderPhoto from '../assets/img/trainings/mostrecomended.png';
import stravaIcon from '../assets/img/icons/Stravalogowhite.webp';
import garageScreenshot from '../assets/img/landing/garage.png';
import coachScreenshot from '../assets/img/landing/coach.png';
import calendarScreenshot from '../assets/img/landing/calendar.png';
import shareBigStats from '../assets/img/landing/s1-web.jpg';
import shareMap from '../assets/img/landing/s2-web.jpg';
import shareMinimal from '../assets/img/landing/s3-web.jpg';
import shareCharts from '../assets/img/landing/s4-web.jpg';
import stravaLogoIcon from '../assets/img/icons/strava.svg';
import appleHealthIcon from '../assets/img/icons/Icon_-_Apple_Health.png';
import appleStoreBadge from '../assets/img/icons/apple_btnwhite.svg';
import qrCodeImg from '../assets/img/icons/qr-code.png';

const APP_STORE_URL = 'https://apps.apple.com/us/app/bikelab-ride-wisely/id6758635138';

const SPEED_CHART = [
  { m: 'Mar', h: 60 },
  { m: 'Apr', h: 68 },
  { m: 'May', h: 82, active: true },
  { m: 'Jun', h: 64 },
  { m: 'Jul', h: 72 }
];

const STRAVA_AUTH_URL = `https://www.strava.com/oauth/authorize?client_id=165560&response_type=code&redirect_uri=${encodeURIComponent(
  (typeof window !== 'undefined' ? window.location.origin : '') + '/exchange_token'
)}&scope=activity:read_all,profile:read_all&approval_prompt=auto`;

const AI_POINTS = [
  { num: '[01]', title: 'Training plans', desc: 'Builds and adjusts plans around your recovery' },
  { num: '[02]', title: 'Bike knowledge', desc: 'Tracks your components and flags service before they fail' },
  { num: '[03]', title: 'Ride analysis', desc: 'Analyzes every ride the moment it lands, in plain language' },
  { num: '[04]', title: 'Goals & calendar', desc: 'Sets goals with you and updates your calendar automatically' }
];

// Heart and Cadence pair a second "vs speed" line, like the app's own
// trend cards - Heart: orange HR vs blue speed; Cadence: purple cadence vs
// an electric-cyan speed line. Point counts are uneven and deltas irregular
// on purpose so the curves read as real ride data, not a clean sine wave.
const ANALYTICS_CHARTS = [
  {
    label: 'Heart', color: 'oklch(0.68 0.19 45)', avg: 138, unit: 'bpm',
    points: [46, 50, 56, 53, 60, 57, 64, 68, 62, 58, 63, 59, 55, 60],
    color2: 'oklch(0.56 0.22 264)',
    points2: [54, 57, 52, 58, 55, 50, 44, 28, 38, 52, 56, 53, 58, 55]
  },
  {
    label: 'Power', color: 'oklch(0.56 0.22 264)', avg: 192, unit: 'W',
    points: [58, 63, 35, 60, 60, 72, 65, 78, 75, 68, 85, 95, 88, 87]
  },
  {
    label: 'Cadence', color: 'oklch(0.58 0.22 300)', avg: 82, unit: 'rpm',
    points: [62, 58, 65, 60, 72, 66, 80, 74, 65, 68, 63, 70, 65, 72],
    color2: 'oklch(0.75 0.17 200)',
    points2: [58, 50, 45, 54, 78, 52, 74, 66, 40, 20, 45, 62, 58, 66]
  },
  {
    label: 'Speed', color: 'oklch(0.65 0.19 145)', avg: 24, unit: 'km/h',
    points: [48, 55, 50, 60, 46, 58, 52, 44, 57, 80, 45, 54, 48, 56]
  }
];

// Builds a smooth (catmull-rom -> bezier) line + closed area path from a
// series of 0-100 values, for the minimalist trend charts in the Analytics
// section - no axes/gridlines/legend, just a stroked line and a soft fill.
function buildTrendPaths(values, width = 200, height = 120, padY = 14) {
  const n = values.length;
  const stepX = width / (n - 1);
  const pts = values.map((v, i) => [i * stepX, height - padY - (v / 100) * (height - padY * 2)]);
  let line = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? i : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  return { line, area };
}

const SHARE_TEMPLATES = [
  { label: 'Big Stats', img: shareBigStats },
  { label: 'Map', img: shareMap },
  { label: 'Minimal', img: shareMinimal },
  { label: 'Charts', img: shareCharts }
];

const COMPONENT_WEAR = [
  { name: 'Chain', pct: 100, km: '5,649', rot: 0 },
  { name: 'Brake Pads', pct: 0, km: '0', rot: -5, flagged: true },
  { name: 'Cassette', pct: 58, km: '7,467', rot: 0 },
  { name: 'Tires', pct: 78, km: '4,715', rot: 0 }
];

const INTEGRATIONS = [
  { name: 'Strava', icon: stravaLogoIcon, desc: 'Every ride starts on Strava. Bikelab pulls it in automatically and builds everything else on top.' },
  { name: 'Apple Health', icon: appleHealthIcon, desc: 'Sleep, resting heart rate, and recovery sync in, so your coach sees the full picture.' }
];

const TESTIMONIALS = [
  { name: 'Rider name', role: 'Placeholder role' },
  { name: 'Rider name', role: 'Placeholder role' },
  { name: 'Rider name', role: 'Placeholder role' }
];

const FAQS = [
  { q: 'Do I need Strava to use Bikelab?', a: 'Yes, for now. Bikelab reads your ride data from Strava and builds everything else on top of it.' },
  { q: 'Does it work with Apple Health?', a: 'Yes. Connect it once and Bikelab pulls in sleep, resting heart rate, and recovery data automatically.' },
  { q: 'What can the AI coach actually do?', a: "It builds training plans, answers questions about your bike and your rides, sets goals with you, and keeps your calendar updated." },
  { q: 'Is Bikelab free?', a: 'Yes — Bikelab is free to download on the App Store.' },
  { q: 'Is there an Android version?', a: 'Not yet. Bikelab is currently iOS only.' }
];

const FOOTER_COLS = [
  { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'AI Coach', href: '#ai-coach' }, { label: 'Analytics', href: '#analytics' }, { label: 'Pricing', href: '#download' }] },
  { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Contact', href: '#' }] },
  { title: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }] }
];

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

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(0);
  const rootRef = useRef(null);
  const [navTone, setNavTone] = useState('dark');
  const [activeNav, setActiveNav] = useState('features');

  // Scrollspy: figure out which section currently sits behind the fixed
  // side nav (vertical center of the viewport) and derive both the active
  // nav dot and the dot color from it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sections = Array.from(root.querySelectorAll('[data-lp-tone]'));
    if (!sections.length) return;

    let frame = null;

    const update = () => {
      const centerY = window.innerHeight / 2;
      let tone = sections[0].dataset.lpTone;
      let nav = sections[0].dataset.lpNav;
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= centerY) {
          tone = el.dataset.lpTone;
          nav = el.dataset.lpNav;
        } else {
          break;
        }
      }
      setNavTone(tone);
      setActiveNav(nav);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="landing-page" ref={rootRef}>
      {/* FIXED NAV DOTS */}
      <div className="lp-dotnav" style={{ '--lp-dotnav-color': NAV_TONE_COLOR[navTone] }}>
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
      </div>

      {/* HERO */}
      <div id="home" className="lp-hero" data-lp-tone="dark" data-lp-nav="home">
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
          <a href={STRAVA_AUTH_URL} className="lp-btn lp-btn--strava">
              <img src={stravaIcon} alt="" className="lp-btn-strava-icon" />
              Sign in with Strava
            </a>
            <a href="#download" className="lp-btn lp-btn--primary">Download on the App Store</a>

            <Link to="/login" className="lp-btn lp-btn--ghost">Continue with login</Link>
          </div>
          <div className="lp-hero-fine">Free to start · Syncs with Strava in one tap</div>
        </div>
      </div>

      {/* GARAGE / HOME */}
      <section id="features" className="lp-section lp-section--light lp-section--pad-lg" data-lp-tone="light" data-lp-nav="garage">
        <div className="lp-watermark lp-watermark--light">GARAGE</div>
        <div className="lp-container lp-grid-2 lp-grid-2--garage">
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--blue">your ride, your data</p>
            <h2 className="lp-h2 lp-h2--dark">Your last <span className="lp-accent">ride</span> is already waiting.</h2>
            <p className="lp-p lp-p--dark" style={{ maxWidth: 460 }}>
              Open the app to your most recent activity — route, distance, speed, and elevation — next to live widgets on your bike's condition and the photos that keep you motivated.
            </p>
          </div>
          <div className="lp-grid-2__visual lp-garage-visual">
            <div className="lp-screenshot-card">
              <img src={garageScreenshot} alt="Bikelab garage screen" className="lp-screenshot-img" />
            </div>
            <div className="lp-widget-stack">
              <div className="lp-widget-card">
                <span className="lp-widget-pill">Primary</span>
                <div className="lp-widget-bike-name">Canyon<br />Ultimate</div>
                <div className="lp-widget-spacer" />
                <div className="lp-widget-sub">47 rides</div>
                <div className="lp-widget-big">5,441.9<span className="lp-widget-unit"> km</span></div>
              </div>
              <div className="lp-widget-card">
                <div className="lp-widget-big">24<span className="lp-widget-unit"> km/h</span></div>
                <div className="lp-widget-sub">Best avg. speed</div>
                <div className="lp-widget-chart">
                  <div className="lp-widget-chart-axis">
                    <span className="lp-widget-chart-line" />
                    <span className="lp-widget-chart-max">30</span>
                  </div>
                  <div className="lp-widget-bars">
                    {SPEED_CHART.map(b => (
                      <div key={b.m} className="lp-widget-bar-col">
                        <div className={`lp-widget-bar${b.active ? ' is-active' : ''}`} style={{ height: `${b.h}%` }} />
                        <span>{b.m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AI COACH */}
      <section id="ai-coach" className="lp-section lp-section--blue-600 lp-section--pad-lg" data-lp-tone="blue" data-lp-nav="ai-coach" style={{ paddingBottom: '180px' }}>
        <div className="lp-blob lp-blob--coach-1" />
        <div className="lp-blob lp-blob--coach-2" />
        <div className="lp-watermark lp-watermark--dark">AI COACH</div>
        <div className="lp-container lp-grid-2 lp-grid-2--wide-left">
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--white">trained on your data</p>
            <h2 className="lp-h2 lp-h2--white">An AI that actually knows your bike.</h2>
            <p className="lp-p" style={{ color: 'oklch(0.94 0.03 264)', maxWidth: 480, marginBottom: 28 }}>
              Ask it anything about cycling — it's connected straight to your ride history, your bike's components, and your goals.
            </p>
            <div className="lp-ai-points">
              {AI_POINTS.map(point => (
                <div className="lp-ai-point" key={point.num}>
                  <span className="lp-ai-point-num">{point.num}</span>
                  <div>
                    <div className="lp-ai-point-title">{point.title}</div>
                    <div className="lp-ai-point-desc">{point.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-grid-2__visual lp-screenshot-card" style={{ maxWidth: '650px', borderRadius: '40px', position: 'relative', top: '32px', left: '45px', boxShadow: 'none', border: 'none', transform: 'scale(1.4)' }}>
            <img src={coachScreenshot} alt="Bikelab AI coach screen" className="lp-screenshot-img" />
          </div>
        </div>
      </section>

      {/* MID-PAGE PROMO */}
      <section className="lp-section lp-section--dark-900 lp-mid-promo" data-lp-tone="dark" data-lp-nav="ai-coach">
        <div className="lp-mid-promo-glow" />
        <div className="lp-container lp-mid-promo-inner">
          <div className="lp-mid-promo-text">
            <p className="lp-kicker lp-kicker--light-blue">power your rides</p>
            <h2 className="lp-h2 lp-h2--white" style={{ marginBottom: 0 }}>Get Bikelab <br /> on your phone.</h2>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="lp-appstore-badge">
              <img src={appleStoreBadge} alt="Download on the App Store" />
            </a>
          </div>
          <div className="lp-mid-promo-cta">
            <div className="lp-qr-box lp-qr-box--sm">
              <img src={qrCodeImg} alt="QR code to download Bikelab on the App Store" className="lp-qr-img" />
            </div>
            <p>Scan qr code to download Bikelab on the App Store</p>
          </div>
        </div>
      </section>

      {/* ANALYTICS */}
      <section id="analytics" className="lp-section lp-section--light lp-section--pad-lg" data-lp-tone="light" data-lp-nav="analytics">
        <div className="lp-watermark lp-watermark--light">ANALYSIS</div>
        <div className="lp-container">
          <div className="lp-eyebrow">
            <p className="lp-kicker lp-kicker--blue">numbers that tell a story</p>
            <h2 className="lp-h2 lp-h2--dark">See the shape of your <span className="lp-accent">progress</span>, not just one ride.</h2>
            <p className="lp-p lp-p--dark">Long-term trends across heart rate, power, cadence, and speed — so a good month looks different from a lucky day.</p>
          </div>
          <div className="lp-chart-grid">
            {ANALYTICS_CHARTS.map(chart => {
              const gradId = `lp-chart-grad-${chart.label}`;
              const grad2Id = `lp-chart-grad2-${chart.label}`;
              const { line, area } = buildTrendPaths(chart.points);
              const secondary = chart.points2 ? buildTrendPaths(chart.points2) : null;
              return (
                <div className="lp-chart-card" key={chart.label}>
                  <div className="lp-chart-card-head">
                    <div className="lp-chart-dot" style={{ background: chart.color }} />
                    <span className="lp-chart-card-label">{chart.label}</span>
                  </div>
                  <div className="lp-chart-card-body">
                    {chart.avg != null && (
                      <div className="lp-chart-avg">
                        {chart.avg}
                        <span className="lp-chart-avg-unit">{chart.unit ? ` ${chart.unit} ` : ' '}avg</span>
                      </div>
                    )}
                    <svg className="lp-chart-svg" viewBox="0 0 200 120" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chart.color} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={chart.color} stopOpacity="0.15" />
                        </linearGradient>
                        {secondary && (
                          <linearGradient id={grad2Id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={chart.color2} stopOpacity="0" />
                            <stop offset="100%" stopColor={chart.color2} stopOpacity="0.05" />
                          </linearGradient>
                        )}
                      </defs>
                      {secondary && <path d={secondary.area} fill={`url(#${grad2Id})`} stroke="none" />}
                      <path d={area} fill={`url(#${gradId})`} stroke="none" />
                      {secondary && (
                        <path d={secondary.line} fill="none" stroke={chart.color2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                      <path d={line} fill="none" stroke={chart.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CALENDAR */}
      <section id="calendar" className="lp-section lp-section--dark-850 lp-section--pad-lg" data-lp-tone="dark" data-lp-nav="calendar">
        <div className="lp-watermark lp-watermark--dark">CALENDAR</div>
        <div className="lp-container lp-grid-2 lp-grid-2--wide-right">
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--light-blue">plans that stick</p>
            <h2 className="lp-h2 lp-h2--white">Training plans that land on your <span className="lp-accent">calendar</span> by themselves.</h2>
            <p className="lp-p" style={{ color: 'oklch(0.72 0.015 264)', maxWidth: 460 }}>
              Every plan your coach builds shows up automatically. Ask for changes in plain language and the calendar rebuilds around you.
            </p>
          </div>
          <div className="lp-grid-2__visual lp-screenshot-card" style={{ maxWidth: '450px', borderRadius: '0px', position: 'relative', top: '38px',}}>
            <img src={calendarScreenshot} alt="Bikelab calendar screen" className="lp-screenshot-img" />
          </div>
        </div>
      </section>

      {/* SHARE STUDIO */}
      <section id="sharing" className="lp-section lp-section--light lp-section--pad-lg" data-lp-tone="light" data-lp-nav="sharing">
        <div className="lp-watermark lp-watermark--light">SHARING</div>
        <div className="lp-container">
          <div className="lp-eyebrow">
            <p className="lp-kicker lp-kicker--blue">make it worth sharing</p>
            <h2 className="lp-h2 lp-h2--dark">Turn a ride into something worth <span className="lp-accent">posting</span>.</h2>
            <p className="lp-p lp-p--dark">Pick a template, drop in your stats and route, share straight to Instagram or save it for later.</p>
          </div>
          <div className="lp-share-grid">
            {SHARE_TEMPLATES.map(tpl => (
              <div className="lp-share-card" key={tpl.label} style={{ backgroundImage: `url(${tpl.img})` }}>
                <div className="lp-share-card-scrim" />
                <span>{tpl.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BIKE GARAGE DEEP DIVE */}
      <section id="components" className="lp-section lp-section--dark-850 lp-section--pad-lg" style={{ paddingTop: 'clamp(230px, 26vw, 292px)' }} data-lp-tone="dark" data-lp-nav="components">
        <div className="lp-watermark lp-watermark--dark">COMPONENTS</div>
        <div className="lp-container lp-grid-2 lp-grid-2--wide-left">
          <div className="lp-grid-2__visual lp-component-grid">
            {COMPONENT_WEAR.map(c => (
              <div className="lp-component-card" key={c.name} style={{ transform: `rotate(${c.rot}deg)` }}>
                <div className="lp-component-head">
                  <span className="lp-component-name">{c.name}</span>
                  {c.flagged && <span className="lp-component-flag" />}
                </div>
                <div className="lp-component-bar">
                  <div className="lp-component-bar-fill" style={{ width: `${c.pct}%` }} />
                </div>
                <div className="lp-component-foot">
                  <span className="lp-component-km">~{c.km} km</span>
                  <span className="lp-component-pct">{c.pct}%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--light-blue">keep it running</p>
            <h2 className="lp-h2 lp-h2--white">Know your bike's <span className="lp-accent">condition</span> before it fails you.</h2>
            <p className="lp-p" style={{ color: 'oklch(0.72 0.015 264)', maxWidth: 460 }}>
              Every component tracked by kilometer — chain, cassette, brake pads, tires — with maintenance reminders and a coach that explains what's wearing and why.
            </p>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section id="integrations" className="lp-section lp-section--light" style={{ padding: 'clamp(80px,10vw,130px) 0' }} data-lp-tone="light" data-lp-nav="integrations">
        <div className="lp-container">
          <div className="lp-eyebrow lp-eyebrow--centered">
            <p className="lp-kicker lp-kicker--blue">already in your pocket</p>
            <h2 className="lp-h2 lp-h2--dark lp-h2--centered">Works with what you already <span className="lp-accent">track</span> with.</h2>
          </div>
          <div className="lp-integration-grid">
            {INTEGRATIONS.map(integ => (
              <div className="lp-integration-card" key={integ.name}>
                <img src={integ.icon} alt={`${integ.name} logo`} className="lp-integration-icon" />
                <div className="lp-integration-name">{integ.name}</div>
                <p className="lp-integration-desc">{integ.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="lp-section lp-section--dark-850" style={{ padding: 'clamp(80px,10vw,130px) 0' }} data-lp-tone="dark" data-lp-nav="testimonials">
        <div className="lp-container">
          <div className="lp-eyebrow lp-eyebrow--centered">
            <p className="lp-kicker lp-kicker--light-blue">real riders, real data</p>
            <h2 className="lp-h2 lp-h2--white lp-h2--centered">What <span className="lp-accent">riders</span> are saying</h2>
          </div>
          <div className="lp-testimonial-grid">
            {TESTIMONIALS.map((t, i) => (
              <div className="lp-testimonial-card" key={i}>
                <span className="lp-testimonial-quote">[ rider quote goes here ]</span>
                <div>
                  <div className="lp-testimonial-name">{t.name}</div>
                  <div className="lp-testimonial-role">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="lp-section lp-section--light" style={{ padding: 'clamp(80px,10vw,130px) 0' }} data-lp-tone="light" data-lp-nav="faq">
        <div className="lp-container" style={{ maxWidth: 800 }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p className="lp-kicker lp-kicker--blue">still curious?</p>
            <h2 className="lp-h2 lp-h2--dark lp-h2--centered">Questions, <span className="lp-accent">answered</span></h2>
          </div>
          <div className="lp-faq-list">
            {FAQS.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div className="lp-faq-item" key={item.q}>
                  <button
                    type="button"
                    className="lp-faq-question"
                    onClick={() => setOpenFaq(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                  >
                    <span className="lp-faq-question-text">{item.q}</span>
                    <span className="lp-faq-sign">{isOpen ? '–' : '+'}</span>
                  </button>
                  {isOpen && <p className="lp-faq-answer">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="download" className="lp-section lp-section--dark-900 lp-final-cta" style={{ padding: 'clamp(80px,10vw,130px) clamp(20px,5vw,48px)' }} data-lp-tone="dark" data-lp-nav="faq">
        <div className="lp-final-cta-glow" />
        <div className="lp-final-cta-inner">
          <p className="lp-kicker lp-kicker--light-blue" style={{ fontSize: 'clamp(20px,2.4vw,26px)' }}>power your rides</p>
          <h2 className="lp-h2 lp-h2--white" style={{ fontSize: 'clamp(34px,5vw,60px)', lineHeight: 1.05 }}>Get Bikelab on your phone.</h2>
          <p className="lp-p" style={{ color: 'oklch(0.72 0.015 264)', marginBottom: 40 }}>Scan the code, or tap below. Free on the App Store.</p>
          <div className="lp-qr-cta">
            <div className="lp-qr-box">
              <img src={qrCodeImg} alt="QR code to download Bikelab on the App Store" className="lp-qr-img" />
            </div>
            <div className="lp-qr-cta-actions">
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="lp-appstore-badge">
                <img src={appleStoreBadge} alt="Download on the App Store" />
              </a>
              <Link to="/login" className="lp-btn--text">or continue on web →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer" data-lp-tone="dark" data-lp-nav="faq">
        <div className="lp-footer-inner">
          <div className="lp-footer-top">
            <div className="lp-footer-brand">
              <img src={bikelabLogo} alt="Bikelab" className="lp-footer-logo" />
              <p className="lp-footer-tagline">Ride wisely. An AI-backed cycling coach for riders who like their training data honest.</p>
            </div>
            {FOOTER_COLS.map(col => (
              <div className="lp-footer-col" key={col.title}>
                <div className="lp-footer-col-title">{col.title}</div>
                {col.links.map(link => (
                  <a href={link.href} className="lp-footer-link" key={link.label}>{link.label}</a>
                ))}
              </div>
            ))}
          </div>
          <div className="lp-footer-bottom">
            <span className="lp-footer-copy">© 2026 Bikelab. All rights reserved.</span>
            <span className="lp-footer-wordmark">Ride → → Wisely</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
