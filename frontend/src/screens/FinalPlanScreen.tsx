import { ArrowLeft, Check, Clock3, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { DayAnalysis, TripAnalysis } from '../types';
import { shortTime, timeToMinutes } from '../utils';

function predictedLateness(trip: TripAnalysis): number {
  if (!trip.arriveBy) return 0;
  return Math.max(0, timeToMinutes(trip.recommended.departureTime)
    + Math.ceil(trip.recommended.travelMinutes) - timeToMinutes(trip.arriveBy));
}

export function FinalPlanScreen({ analysis, onBack, onAccept, busy }: { analysis: DayAnalysis; onBack: () => void; onAccept: () => void; busy: boolean }) {
  const atRisk = analysis.trips.filter((trip) => predictedLateness(trip) > 0);
  const hasEstimatedRoutes = analysis.trips.some((trip) => /Planning estimate|estimated|estimate/i.test(trip.recommended.source));
  return <div className="screen narrow final-plan-screen">
    <button className="back" onClick={onBack}><ArrowLeft/> Back to today's overview</button>
    <div className="screen-title"><p className="eyebrow">YOUR TRAVEL ANALYSIS</p><h1>Review your route plan</h1>
      <p>Compare estimated travel time and exposure for your whole day. Arrival times are predictions, not guarantees.</p>
    </div>
    {atRisk.length > 0 && <div className="editor-warning final-risk" role="alert"><AlertTriangle size={20}/><span>
      <strong>{atRisk.length} appointment{atRisk.length === 1 ? '' : 's'} at risk.</strong> At least one trip is estimated to arrive late even after considering earlier departures. Change your start time or appointment before treating this as an on-time plan.
    </span></div>}
    {hasEstimatedRoutes && <p className="fine-print" role="note">Some routes or departure-time adjustments are planning estimates, not verified directions or transit timetables. Check live traffic and available services before traveling.</p>}
    <div className="timeline">{analysis.trips.map((trip) => {
      const late = predictedLateness(trip);
      return <div className="timeline-row" key={trip.tripId}>
        <span className="timeline-dot"/><div>
          <strong>{shortTime(trip.recommended.departureTime)} · {trip.origin} → {trip.destination}</strong>
          <p>{trip.recommended.label} · approx. {trip.recommended.travelMinutes} min{trip.arriveBy ? ' · needed by ' + shortTime(trip.arriveBy) : ''}</p>
          {late > 0 && <p className="final-late">Estimated {late} min late. This appointment is not feasible with the shown departure.</p>}
          {trip.changed && late === 0 && <p>{trip.explanation}</p>}
        </div>{late ? <AlertTriangle color="#ba3b29"/> : trip.changed ? <ShieldCheck/> : <Check/>}
      </div>;
    })}</div>
    <section className="summary-card"><div><Clock3/><span>Total extra travel</span><strong>+{analysis.metrics.extraTravelMinutes} min</strong></div>
      <div><AlertTriangle/><span>Appointments at risk (estimated)</span><strong>{atRisk.length}</strong></div>
      <div><ShieldCheck/><span>Modeled exposure reduction</span><strong>{analysis.metrics.exposureReductionPct}%</strong></div></section>
    <button className="primary full" disabled={busy} onClick={onAccept}>{busy ? 'Saving plan…' : atRisk.length ? 'Save draft with warnings' : 'Use this plan'}</button>
  </div>;
}
