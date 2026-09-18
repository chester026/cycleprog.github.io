// T-6.5: split out of LandingPage.jsx — final CTA section + footer.
import { Link } from 'react-router-dom';
import bikelabLogo from '../../assets/img/logo/sign_white.svg';
import appleStoreBadge from '../../assets/img/icons/apple_btnwhite.svg';
import qrCodeImg from '../../assets/img/icons/qr-code.png';

const APP_STORE_URL = 'https://apps.apple.com/us/app/bikelab-ride-wisely/id6758635138';

const FOOTER_COLS = [
  { title: 'Product', links: [{ label: 'Features', href: '#features' }, { label: 'AI Coach', href: '#ai-coach' }, { label: 'Analytics', href: '#analytics' }, { label: 'Pricing', href: '#download' }] },
  { title: 'Company', links: [{ label: 'About', href: '#' }, { label: 'Contact', href: '#' }] },
  { title: 'Legal', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }] }
];

// Final CTA is regular page content (renders inside <main>); the footer
// is its own landmark and is rendered by the page as a sibling of <main>
// (a <footer> nested inside <main>/<section> loses its implicit
// `contentinfo` landmark role), so the two are exported separately.
export function CtaSection() {
  return (
      <section id="download" className="lp-section lp-section--dark-900 lp-final-cta" style={{ padding: 'clamp(80px,10vw,130px) clamp(20px,5vw,48px)' }} aria-labelledby="lp-download-heading" data-lp-tone="dark" data-lp-nav="faq">
        <div className="lp-final-cta-glow" />
        <div className="lp-final-cta-inner">
          <p className="lp-kicker lp-kicker--light-blue" style={{ fontSize: 'clamp(20px,2.4vw,26px)' }}>power your rides</p>
          <h2 id="lp-download-heading" className="lp-h2 lp-h2--white" style={{ fontSize: 'clamp(34px,5vw,60px)', lineHeight: 1.05 }}>Get Bikelab on your phone.</h2>
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
  );
}

export function SiteFooter() {
  return (
      <footer className="lp-footer" aria-label="Site footer" data-lp-tone="dark" data-lp-nav="faq">
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
  );
}
