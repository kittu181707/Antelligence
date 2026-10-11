import { ArrowLeft, Check, Clock3, ShieldCheck, ArrowRight } from 'lucide-react';
import type { DayAnalysis } from '../types';
import { shortTime } from '../utils';

export function FinalPlanScreen({
  analysis,
  onBack,
  onAccept,
  busy,
}: {
  analysis: DayAnalysis;
  onBack: () => void;
  onAccept: () => void;
  busy: boolean;
}) {
  return (
    <div className="screen narrow">
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>Return to Change Inspection</span>
      </button>

      <div className="screen-title">
        <p className="eyebrow">FINAL REVIEW · COMMITMENT</p>
        <h1>Your Optimized Schedule</h1>
        <p>Identical appointments. Measurably lower environmental burden.</p>
      </div>

      <div className="timeline renaissance-timeline renaissance-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        {analysis.trips.map((trip) => (
          <div className="timeline-row" key={trip.tripId}>
            <div className="time">{shortTime(trip.recommended.departureTime)}</div>
            <div className="timeline-dot" />
            <div className="journey-summary">
              <div className="journey-route">
                <strong>{trip.origin}</strong>
                <ArrowRight size={13} className="gold-arrow" />
                <strong>{trip.destination}</strong>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--ivory-muted)' }}>
                {trip.changed
                  ? `${trip.recommended.label} · ${
                      trip.recommended.travelMinutes - trip.original.travelMinutes >= 0 ? '+' : ''
                    }${trip.recommended.travelMinutes - trip.original.travelMinutes} min delta`
                  : 'Maintained original optimal route'}
              </p>
            </div>
            {trip.changed ? (
              <span title="Optimized for reduced exposure"><ShieldCheck size={18} className="gold-accent" /></span>
            ) : (
              <span title="Original already optimal"><Check size={18} className="emerald-accent" /></span>
            )}
          </div>
        ))}
      </div>

      <section className="summary-card renaissance-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px', textAlign: 'center' }}>
        <div>
          <Clock3 size={18} className="gold-accent" style={{ margin: '0 auto 4px' }} />
          <span style={{ fontSize: '11px', color: 'var(--ivory-muted)', display: 'block' }}>Extra Transit Time</span>
          <strong style={{ fontSize: '18px', color: 'var(--gold-bright)' }}>+{analysis.metrics.extraTravelMinutes} min</strong>
        </div>
        <div>
          <Check size={18} className="emerald-accent" style={{ margin: '0 auto 4px' }} />
          <span style={{ fontSize: '11px', color: 'var(--ivory-muted)', display: 'block' }}>Missed Appointments</span>
          <strong style={{ fontSize: '18px', color: 'var(--green-bright)' }}>0</strong>
        </div>
        <div>
          <ShieldCheck size={18} className="gold-accent" style={{ margin: '0 auto 4px' }} />
          <span style={{ fontSize: '11px', color: 'var(--ivory-muted)', display: 'block' }}>Modeled Reduction</span>
          <strong style={{ fontSize: '18px', color: 'var(--gold-bright)' }}>{analysis.metrics.exposureReductionPct}%</strong>
        </div>
      </section>

      <button className="primary full large renaissance-btn-primary" disabled={busy} onClick={onAccept}>
        <ShieldCheck size={18} />
        <span>{busy ? 'Committing Plan to DynamoDB…' : 'Accept & Use This Plan'}</span>
      </button>
    </div>
  );
}
