// T-6.5: split out of LandingPage.jsx — the "feature tour" sections
// (Garage, AI Coach, mid-page promo, Analytics, Calendar, Components,
// Integrations). No behaviour change, same markup/classes/strings.
import garageScreenshot from '../../assets/img/landing/garage.png';
import coachScreenshot from '../../assets/img/landing/coach.png';
import calendarScreenshot from '../../assets/img/landing/calendar.png';
import stravaLogoIcon from '../../assets/img/icons/strava.svg';
import appleHealthIcon from '../../assets/img/icons/Icon_-_Apple_Health.png';
import appleStoreBadge from '../../assets/img/icons/apple_btnwhite.svg';
import qrCodeImg from '../../assets/img/icons/qr-code.png';

const APP_STORE_URL = 'https://apps.apple.com/us/app/bikelab-ride-wisely/id6758635138';

const SPEED_CHART = [
  { m: 'Mar', h: 60 },
  { m: 'Apr', h: 68 },
  { m: 'May', h: 82, active: true },
  { m: 'Jun', h: 64 },
  { m: 'Jul', h: 72 }
];

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
    points: [46, 50, 65, 53, 60, 57, 64, 68, 62, 58, 63, 59, 55, 60],
    color2: 'oklch(0.56 0.22 264)',
    points2: [65, 57, 56, 45, 55, 50, 44, 26, 38, 52, 56, 53, 48, 55]
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
function buildTrendPaths(values, width = 200, height = 80, padY = 10) {
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

export function Features() {
  return (
    <>
      {/* GARAGE / HOME */}
      <section id="features" className="lp-section lp-section--light lp-section--pad-lg" aria-labelledby="lp-garage-heading" data-lp-tone="light" data-lp-nav="garage">
        <div className="lp-watermark lp-watermark--light">GARAGE</div>
        <div className="lp-container lp-grid-2 lp-grid-2--garage">
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--blue">your ride, your data</p>
            <h2 id="lp-garage-heading" className="lp-h2 lp-h2--dark">Your last <span className="lp-accent">ride</span> is already waiting.</h2>
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
      <section id="ai-coach" className="lp-section lp-section--blue-600 lp-section--pad-lg lp-section--coach" aria-labelledby="lp-ai-coach-heading" data-lp-tone="blue" data-lp-nav="ai-coach">
        <div className="lp-blob lp-blob--coach-1" />
        <div className="lp-blob lp-blob--coach-2" />
        <div className="lp-watermark lp-watermark--dark">AI COACH</div>
        <div className="lp-container lp-grid-2 lp-grid-2--wide-left">
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--white">trained on your data</p>
            <h2 id="lp-ai-coach-heading" className="lp-h2 lp-h2--white">An AI that actually knows your bike.</h2>
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
          <div className="lp-grid-2__visual lp-screenshot-card" style={{ maxWidth: '650px', borderRadius: '40px', position: 'relative', top: '48px', left: '60px', boxShadow: 'none', border: 'none', transform: 'scale(1.4)' }}>
            <img src={coachScreenshot} alt="Bikelab AI coach screen" className="lp-screenshot-img" />
          </div>
        </div>
      </section>

      {/* MID-PAGE PROMO */}
      <section className="lp-section lp-section--dark-900 lp-mid-promo" aria-label="Download Bikelab" data-lp-tone="dark" data-lp-nav="ai-coach">
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
      <section id="analytics" className="lp-section lp-section--light lp-section--pad-lg" aria-labelledby="lp-analytics-heading" data-lp-tone="light" data-lp-nav="analytics">
        <div className="lp-watermark lp-watermark--light">ANALYSIS</div>
        <div className="lp-container">
          <div className="lp-eyebrow">
            <p className="lp-kicker lp-kicker--blue">numbers that tell a story</p>
            <h2 id="lp-analytics-heading" className="lp-h2 lp-h2--dark">See the shape of your <span className="lp-accent">progress</span>, not just one ride.</h2>
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
                    <svg className="lp-chart-svg" viewBox="0 0 200 80" preserveAspectRatio="none" role="img" aria-label={`${chart.label} trend`}>
                      <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chart.color} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={chart.color} stopOpacity="0.15" />
                        </linearGradient>
                        {secondary && (
                          <linearGradient id={grad2Id} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={chart.color2} stopOpacity="0.09" />
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
      <section id="calendar" className="lp-section lp-section--dark-850 lp-section--pad-lg" aria-labelledby="lp-calendar-heading" data-lp-tone="dark" data-lp-nav="calendar">
        <div className="lp-watermark lp-watermark--dark">CALENDAR</div>
        <div className="lp-container lp-grid-2 lp-grid-2--wide-right">
          <div className="lp-grid-2__text">
            <p className="lp-kicker lp-kicker--light-blue">plans that stick</p>
            <h2 id="lp-calendar-heading" className="lp-h2 lp-h2--white">Training plans that land on your <span className="lp-accent">calendar</span> by themselves.</h2>
            <p className="lp-p" style={{ color: 'oklch(0.72 0.015 264)', maxWidth: 460 }}>
              Every plan your coach builds shows up automatically. Ask for changes in plain language and the calendar rebuilds around you.
            </p>
          </div>
          <div className="lp-grid-2__visual lp-screenshot-card" style={{ maxWidth: '450px', borderRadius: '0px', position: 'relative', top: '38px' }}>
            <img src={calendarScreenshot} alt="Bikelab calendar screen" className="lp-screenshot-img" />
          </div>
        </div>
      </section>

      {/* BIKE GARAGE DEEP DIVE */}
      <section id="components" className="lp-section lp-section--dark-850 lp-section--pad-lg lp-section--components" aria-labelledby="lp-components-heading" data-lp-tone="dark" data-lp-nav="components">
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
            <h2 id="lp-components-heading" className="lp-h2 lp-h2--white">Know your bike's <span className="lp-accent">condition</span> before it fails you.</h2>
            <p className="lp-p" style={{ color: 'oklch(0.72 0.015 264)', maxWidth: 460 }}>
              Every component tracked by kilometer — chain, cassette, brake pads, tires — with maintenance reminders and a coach that explains what's wearing and why.
            </p>
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section id="integrations" className="lp-section lp-section--light" style={{ padding: 'clamp(80px,10vw,130px) 0' }} aria-labelledby="lp-integrations-heading" data-lp-tone="light" data-lp-nav="integrations">
        <div className="lp-container">
          <div className="lp-eyebrow lp-eyebrow--centered">
            <p className="lp-kicker lp-kicker--blue">already in your pocket</p>
            <h2 id="lp-integrations-heading" className="lp-h2 lp-h2--dark lp-h2--centered">Works with what you already <span className="lp-accent">track</span> with.</h2>
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
    </>
  );
}
