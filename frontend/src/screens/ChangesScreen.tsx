import { ArrowLeft, ArrowRight, Clock3, HelpCircle } from 'lucide-react';
import type { DayAnalysis, TripAnalysis } from '../types';
import { shortTime } from '../utils';

export function ChangesScreen({ analysis, onBack, onWhy, onFinal }: { analysis: DayAnalysis; onBack: () => void; onWhy: (trip: TripAnalysis) => void; onFinal: () => void }) {
  return <div className="screen wide"><button className="back" onClick={onBack}><ArrowLeft/>Overview</button><div className="screen-title"><p className="eyebrow">WHAT CHANGED</p><h1>{analysis.changes.length ? `${analysis.changes.length} focused change${analysis.changes.length === 1 ? '' : 's'}` : 'No change needed'}</h1><p>We prioritize reaching appointments where possible, then compare travel time and modeled exposure.</p></div>
    <div className="change-list">{analysis.changes.map((trip, index) => <article className="change-card" key={trip.tripId}>
      <div className="change-heading"><div><span>Change {index + 1}</span><h2>{shortTime(trip.recommended.departureTime)} · {trip.origin} → {trip.destination}</h2></div><button className="text-button" onClick={() => onWhy(trip)}><HelpCircle/>Why?</button></div>
      <div className="compare-grid"><div><p>ORIGINAL</p><strong>{trip.original.label}</strong><span>{trip.original.travelMinutes} min</span><span>Exposure {trip.original.modeledExposure.toFixed(0)}</span></div><ArrowRight/><div className="recommended"><p>RECOMMENDED</p><strong>{trip.recommended.label}</strong><span>{trip.recommended.travelMinutes} min</span><span>Exposure {trip.recommended.modeledExposure.toFixed(0)}</span></div></div>
      <div className="change-impact"><Clock3/> {trip.recommended.travelMinutes - trip.original.travelMinutes >= 0 ? '+' : ''}{trip.recommended.travelMinutes - trip.original.travelMinutes} min <strong>{Math.round((trip.recommended.modeledExposure / Math.max(0.01, trip.original.modeledExposure) - 1) * 100)}% modeled exposure change</strong></div>
    </article>)}</div>
    <div className="sticky-actions"><button className="primary" onClick={onFinal}>Review final plan</button></div>
  </div>;
}
