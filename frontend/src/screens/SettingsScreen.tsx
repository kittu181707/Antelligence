import { PRODUCT_NAME } from '../config';
import { Sliders, Shield, Zap, Award } from 'lucide-react';

export function SettingsScreen({ maxExtra, setMaxExtra }: { maxExtra: number; setMaxExtra: (v: number) => void }) {
  return (
    <div className="screen narrow with-nav">
      <div className="screen-title">
        <p className="eyebrow">CONFIG · ALGORITHMIC CONSTRAINTS</p>
        <h1>Optimization Preferences</h1>
        <p>{PRODUCT_NAME} utilizes these thresholds as hard constraints, not medical instructions.</p>
      </div>

      <section className="renaissance-card preference-card vertical" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Sliders size={18} className="gold-accent" />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '18px' }}>Optimization Priority</h2>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--ivory-muted)' }}>
            Determines whether the multi-objective search strictly minimizes modeled inhaled dose or enforces fastest route timing.
          </p>
        </div>
        <div className="segmented">
          <button className={maxExtra > 0 ? 'selected' : ''} onClick={() => setMaxExtra(10)}>
            Lowest Inhaled Exposure
          </button>
          <button className={maxExtra === 0 ? 'selected' : ''} onClick={() => setMaxExtra(0)}>
            Fastest Route (Zero Extra Time)
          </button>
        </div>
      </section>

      <section className="renaissance-card preference-card vertical" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Zap size={18} className="gold-accent" />
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '18px' }}>Whole-Day Extra Travel Budget</h2>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--ivory-muted)' }}>
            The maximum cumulative additional transit minutes permitted across all daily itineraries combined.
          </p>
        </div>
        <div className="segmented">
          {[0, 5, 10, 15].map((v) => (
            <button key={v} className={maxExtra === v ? 'selected' : ''} onClick={() => setMaxExtra(v)}>
              {v ? `+${v}` : '0'} min
            </button>
          ))}
        </div>
      </section>

      <div className="renaissance-card info-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Award size={18} className="gold-accent" />
          <strong style={{ fontSize: '14px', color: 'var(--ivory)' }}>Scientific Disclaimer & Transparency</strong>
        </div>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, color: 'var(--ivory-muted)' }}>
          Calculations are simulated estimates generated for comparative commuter decision support. They do not constitute
          clinical safety guarantees, biological dosage assertions, or certified medical diagnosis. Always heed local
          public health advisories issued by environmental protection authorities.
        </p>
      </div>
    </div>
  );
}
