import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarClock, CreditCard, Users } from 'lucide-react';
import './Landing (1).css';

const months = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (5 - i));
  return d.toLocaleString('en-IN', { month: 'short' });
});
const bars = [38, 52, 46, 64, 58, 82];
const currentYear = new Date().getFullYear();

const features = [
  { Icon: Users, title: 'Customers', text: 'Every account, plan and seat count in one place.', more: 'Search customers, see their plans and deactivate accounts without leaving the list.' },
  { Icon: CalendarClock, title: 'Renewals', text: 'See what renews next, and pause or close in a click.', more: 'Generate due invoices in one step and turn an accepted quote into a subscription.' },
  { Icon: CreditCard, title: 'Payments', text: 'Record what you receive and watch balances update.', more: 'Every payment is tied to an invoice, so outstanding balances are always current.' }
];

export default function Landing({ onGetStarted, onSignIn }) {
  const [stage, setStage] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 2 : 0);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const a = setTimeout(() => setStage(1), 3400);
    const b = setTimeout(() => setStage(2), 4800);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const tilt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty('--ry', `${x * 14}deg`);
    e.currentTarget.style.setProperty('--rx', `${-y * 14}deg`);
  };
  const untilt = (e) => {
    e.currentTarget.style.setProperty('--ry', '0deg');
    e.currentTarget.style.setProperty('--rx', '0deg');
  };

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <span className="landing-mark" aria-hidden="true"><span /><span /><span /></span>
          <span className="landing-word">sub<span>sight</span></span>
        </div>
        <button className="landing-link" onClick={onSignIn}>Sign in</button>
      </header>

      <main className="landing-hero">
        <div className="landing-copy">
          <h1>Good business runs on good rhythm.</h1>
          <p>One steady view of every customer, renewal and payment.</p>
          <div className={`landing-actions ${stage === 2 ? 'is-visible' : ''}`}>
            <button className="landing-button" onClick={onGetStarted}>Get started <ArrowUpRight size={16} /></button>
            <button className="landing-link" onClick={onSignIn}>I already have an account</button>
          </div>
        </div>

        <div className="stage" aria-label="Sample revenue and dashboard preview">
          <div className={`paper ${stage === 1 ? 'is-crumpling' : ''} ${stage === 2 ? 'is-gone' : ''}`}>
            <div className="paper-head"><b>Revenue received</b><small>Sample view</small></div>
            <div className="plot-wrap">
              <div className="plot">
                {bars.map((v, i) => (
                  <div className="col" key={months[i] + i}>
                    <div className="cuboid" style={{ '--h': `${v * 2}px`, '--i': i }}>
                      <i className="face front" /><i className="face side" /><i className="face top" />
                    </div>
                    <span>{months[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`dash ${stage === 2 ? 'is-shown' : ''}`}>
            <div className="dash-side"><i /><i /><i /><i /></div>
            <div className="dash-main">
              <div className="dash-tiles">
                <div><small>Active subscriptions</small><b>128</b></div>
                <div><small>Revenue received</small><b>₹4.2L</b></div>
                <div><small>Outstanding</small><b>₹38k</b></div>
              </div>
              <div className="dash-rows"><i /><i /><i /></div>
              <small className="dash-note">Sample view</small>
            </div>
          </div>
        </div>
      </main>

      <section className="cards">
        {features.map(({ Icon, title, text, more }, index) => (
          <button
            key={title}
            className={`tilt ${open === index ? 'open' : ''}`}
            onMouseMove={tilt}
            onMouseLeave={untilt}
            onClick={() => setOpen(open === index ? null : index)}
            aria-expanded={open === index}
          >
            <span className="tilt-icon"><Icon size={20} strokeWidth={1.8} /></span>
            <h2>{title}</h2>
            <p>{text}</p>
            <span className="more">{more}</span>
          </button>
        ))}
      </section>

      <footer className="landing-footer">© {currentYear} Brightloop Software. Built for recurring business.</footer>
    </div>
  );
}
