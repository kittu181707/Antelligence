import { ArrowLeft, ArrowRight, Clock3, HelpCircle } from 'lucide-react';
import type { DayAnalysis, TripAnalysis } from '../types';
import { shortTime } from '../utils';

export function ChangesScreen({
  analysis,
  onBack,
  onWhy,
  onFinal,
}: {
  analysis: DayAnalysis;
  onBack: () => void;
  onWhy: (trip: TripAnalysis) => void;
  onFinal: () => void;
}) {
  return (
    <div className="screen wide">
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>Return to Itinerary Overview</span>
      </button>

      <div className="screen-title">
        <p className="eyebrow">ACT V · TRIP COMPARISONS</p>
        <h1>
          {analysis.changes.length
            ? `${analysis.changes.length} Focused Route Modification${analysis.changes.length === 1 ? '' : 's'}`
            : 'No Modifications Required'}
        </h1>
        <p>
          The optimizer selectively modifies only journeys that measurably reduce exposure while
          strictly honoring your extra travel time budget.
        </p>
      </div>

      <div className="change-list">
        {analysis.changes.map((trip, index) => (
          <article className="change-card renaissance-card" key={trip.tripId}>
            <div className="change-heading">
              <div>
                <span className="card-kicker">MODIFICATION {String(index + 1).padStart(2, '0')}</span>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', margin: '2px 0 0', color: 'var(--ivory)' }}>
                  {shortTime(trip.recommended.departureTime)} · {trip.origin} → {trip.destination}
                </h2>
              </div>
              <button className="secondary renaissance-btn-secondary" style={{ padding: '6px 14px', fontSize: '11px' }} onClick={() => onWhy(trip)}>
                <HelpCircle size={14} className="gold-accent" />
                <span>Explain Trade-offs</span>
              </button>
            </div>

            <div className="compare-grid renaissance-compare-grid" style={{ margin: '16px 0' }}>
              <div className="compare-col original-box">
                <span className="col-label">BASELINE PATHWAY</span>
                <strong>{trip.original.label}</strong>
                <span className="col-time">{trip.original.travelMinutes} min</span>
                <span className="col-exp">Modeled Exposure: {trip.original.modeledExposure.toFixed(0)}</span>
              </div>
              <ArrowRight size={20} className="gold-accent arrow-split" />
              <div className="compare-col recommended-box">
                <span className="col-label rec-tag">RECOMMENDED PATHWAY</span>
                <strong>{trip.recommended.label}</strong>
                <span className="col-time">{trip.recommended.travelMinutes} min</span>
                <span className="col-exp">Modeled Exposure: {trip.recommended.modeledExposure.toFixed(0)}</span>
              </div>
            </div>

            <div className="change-impact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line-subtle)', paddingTop: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ivory-muted)' }}>
                <Clock3 size={15} className="gold-accent" />
                <span>
                  {trip.recommended.travelMinutes - trip.original.travelMinutes >= 0 ? '+' : ''}
                  {trip.recommended.travelMinutes - trip.original.travelMinutes} min transit delta
                </span>
              </span>
              <strong style={{ color: 'var(--green-bright)', fontSize: '13px' }}>
                {Math.max(
                  0,
                  Math.round((1 - trip.recommended.modeledExposure / Math.max(0.01, trip.original.modeledExposure)) * 100),
                )}% lower modeled exposure
              </strong>
            </div>
          </article>
        ))}
      </div>

      <div className="sticky-actions">
        <button className="primary large renaissance-btn-primary" onClick={onFinal}>
          <span>Review Final Day Plan</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
