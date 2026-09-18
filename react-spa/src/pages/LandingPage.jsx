import { useEffect, useRef, useState } from 'react';
import './LandingPage.css';
import { startStravaLogin } from '../utils/strava';
import { Hero, LandingNav } from './landing/Hero';
import { Features } from './landing/Features';
import { Screens } from './landing/Screens';
import { CtaSection, SiteFooter } from './landing/CtaFooter';

// T-6.5 (audit landing hygiene): AnalysisPage's sibling task — LandingPage
// was 601 lines in one file. Split into src/pages/landing/{Hero,Features,
// Screens,CtaFooter}.jsx (same markup/classes/strings, no visual redesign).
// This file keeps only what's genuinely page-wide: the scroll container
// ref the scrollspy below reads from, the derived nav tone/active-section
// state the fixed dot nav needs, and the Strava login handler the hero CTA
// calls. Semantic landmarks added: <nav> for the dot rail, <main> around
// the scrollable content, <section aria-labelledby>/aria-label> per section
// (done in each landing/* piece) so the page structure reads correctly to
// assistive tech and Lighthouse.
export default function LandingPage() {
  const rootRef = useRef(null);
  const [navTone, setNavTone] = useState('dark');
  const [activeNav, setActiveNav] = useState('features');

  const handleStravaLogin = async (e) => {
    e.preventDefault();
    try {
      await startStravaLogin();
    } catch (err) {
      console.error('Failed to start Strava login:', err);
    }
  };

  // Scrollspy: figure out which section currently sits behind the fixed
  // side nav (vertical center of the viewport) and derive both the active
  // nav dot and the dot color from it. Sections live across Hero/Features/
  // Screens/CtaFooter, so this queries the whole root DOM rather than any
  // one piece's own markup.
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
      <LandingNav navTone={navTone} activeNav={activeNav} />
      <main>
        <Hero onStravaLogin={handleStravaLogin} />
        <Features />
        <Screens />
        <CtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
