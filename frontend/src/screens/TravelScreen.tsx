import { ArrowLeft, ArrowRight, Clock3, Sliders } from 'lucide-react';
import type { JourneyInput, TransportMode } from '../types';
import { modes, shortTime } from '../utils';

export function TravelScreen({
  journeys,
  setJourneys,
  maxExtra,
  setMaxExtra,
  onBack,
  onAnalyze,
  isDemo,
}: {
  journeys: JourneyInput[];
  setJourneys: (value: JourneyInput[]) => void;
  maxExtra: number;
  setMaxExtra: (value: number) => void;
  onBack: () => void;
  onAnalyze: () => void;
  isDemo: boolean;
}) {
  const update = (id: string, patch: Partial<JourneyInput>) =>
    setJourneys(journeys.map((j) => (j.tripId === id ? { ...j, ...patch } : j)));

  return (
    <div className="screen wide">
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>Return to Itinerary Setup</span>
      </button>

      <div className="screen-title">
        <p className="eyebrow">ACT III · TRANSIT CONSTRAINTS</p>
        <h1>Configure Journey Parameters</h1>
        <p>Confirm your default travel mode, planned departure times, and extra travel budget.</p>
      </div>

      <div className="journey-list">
        {journeys.map((journey, index) => (
          <article className="journey-card renaissance-card" key={journey.tripId}>
            <div className="journey-head">
              <span style={{ color: 'var(--gold)', fontWeight: 600 }}>JOURNEY {String(index + 1).padStart(2, '0')}</span>
              <strong style={{ color: 'var(--ivory)' }}>
                {shortTime(journey.departureTime)}
                {journey.arriveBy ? ` → Arrive by ${shortTime(journey.arriveBy)}` : ''}
              </strong>
            </div>

            <div className="route-pair">
              <strong>{journey.origin}</strong>
              <ArrowRight size={18} className="gold-accent" />
              <strong>{journey.destination}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '20px', alignItems: 'end', marginTop: '14px' }}>
              <label>
                <span>Planned Departure</span>
                <input
                  type="time"
                  value={journey.departureTime}
                  onChange={(e) => update(journey.tripId, { departureTime: e.target.value })}
                  style={{ marginTop: '4px' }}
                />
              </label>

              <div>
                <span className="field-label">Intended Transport Mode</span>
                <div className="mode-grid">
                  {modes.map((mode) => {
                    const disabled = mode.value === 'bike' && !isDemo;
                    return (
                      <button
                        className={journey.mode === mode.value ? 'selected' : ''}
                        key={mode.value}
                        disabled={disabled}
                        title={disabled ? 'Live bicycle routing is not verified by the configured Amazon Location provider' : undefined}
                        onClick={() => update(journey.tripId, { mode: mode.value as TransportMode })}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <article className="preference-card renaissance-card" style={{ marginTop: '20px' }}>
        <div>
          <p className="eyebrow">TEMPORAL BUDGET</p>
          <h2 style={{ margin: '4px 0 2px', fontFamily: 'var(--font-serif)', fontSize: '18px' }}>
            Maximum Extra Travel Today
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--ivory-muted)' }}>
            Permitted additional minutes the optimizer may allocate to route around high-pollution hotspots.
          </p>
        </div>
        <div className="segmented">
          {[0, 5, 10, 15].map((v) => (
            <button
              key={v}
              className={maxExtra === v ? 'selected' : ''}
              onClick={() => setMaxExtra(v)}
            >
              {v ? `+${v}` : '0'} min
            </button>
          ))}
        </div>
      </article>

      <div className="sticky-actions">
        <button className="primary large renaissance-btn-primary" onClick={onAnalyze}>
          <span>Analyze & Optimize My Day</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
