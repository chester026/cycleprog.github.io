// T-6.5: split out of LandingPage.jsx — Share Studio, Testimonials and FAQ.
// `openFaq` is local: nothing outside this piece reads or drives it.
import { useState } from 'react';
import shareBigStats from '../../assets/img/landing/s1-web.jpg';
import shareMap from '../../assets/img/landing/s2-web.jpg';
import shareMinimal from '../../assets/img/landing/s3-web.jpg';
import shareCharts from '../../assets/img/landing/s4-web.jpg';

const SHARE_TEMPLATES = [
  { label: 'Big Stats', img: shareBigStats },
  { label: 'Map', img: shareMap },
  { label: 'Minimal', img: shareMinimal },
  { label: 'Charts', img: shareCharts }
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

export function Screens() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <>
      {/* SHARE STUDIO */}
      <section id="sharing" className="lp-section lp-section--light lp-section--pad-lg" aria-labelledby="lp-sharing-heading" data-lp-tone="light" data-lp-nav="sharing">
        <div className="lp-watermark lp-watermark--light">SHARING</div>
        <div className="lp-container">
          <div className="lp-eyebrow">
            <p className="lp-kicker lp-kicker--blue">make it worth sharing</p>
            <h2 id="lp-sharing-heading" className="lp-h2 lp-h2--dark">Turn a ride into something worth <span className="lp-accent">posting</span>.</h2>
            <p className="lp-p lp-p--dark">Pick a template, drop in your stats and route, share straight to Instagram or save it for later.</p>
          </div>
          <div className="lp-share-grid">
            {SHARE_TEMPLATES.map(tpl => (
              <div className="lp-share-card" key={tpl.label} style={{ backgroundImage: `url(${tpl.img})` }} role="img" aria-label={`${tpl.label} share template`}>
                <div className="lp-share-card-scrim" />
                <span>{tpl.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="lp-section lp-section--dark-850" style={{ padding: 'clamp(80px,10vw,130px) 0' }} aria-labelledby="lp-testimonials-heading" data-lp-tone="dark" data-lp-nav="testimonials">
        <div className="lp-container">
          <div className="lp-eyebrow lp-eyebrow--centered">
            <p className="lp-kicker lp-kicker--light-blue">real riders, real data</p>
            <h2 id="lp-testimonials-heading" className="lp-h2 lp-h2--white lp-h2--centered">What <span className="lp-accent">riders</span> are saying</h2>
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
      <section id="faq" className="lp-section lp-section--light" style={{ padding: 'clamp(80px,10vw,130px) 0' }} aria-labelledby="lp-faq-heading" data-lp-tone="light" data-lp-nav="faq">
        <div className="lp-container" style={{ maxWidth: 800 }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p className="lp-kicker lp-kicker--blue">still curious?</p>
            <h2 id="lp-faq-heading" className="lp-h2 lp-h2--dark lp-h2--centered">Questions, <span className="lp-accent">answered</span></h2>
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
    </>
  );
}
