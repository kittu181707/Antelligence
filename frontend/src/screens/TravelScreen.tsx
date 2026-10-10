import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import type { JourneyInput, TransportMode } from '../types';
import { modes } from '../utils';

export function TravelScreen({ journeys, setJourneys, maxExtra, setMaxExtra, onBack, onAnalyze, isDemo, busy = false, error }: {
  journeys: JourneyInput[]; setJourneys: (value: JourneyInput[]) => void; maxExtra: number; setMaxExtra: (value: number) => void;
  onBack: () => void; onAnalyze: () => void; isDemo: boolean; busy?: boolean; error?: string;
}) {
  const update = (id: string, patch: Partial<JourneyInput>) =>
    setJourneys(journeys.map((journey) => journey.tripId === id ? { ...journey, ...patch } : journey));
  const hasTransit = !isDemo && journeys.some((journey) => journey.mode === 'bus' || journey.mode === 'metro');

  return <div className="screen travel-review">
    <button className="back" onClick={onBack}><ArrowLeft size={17}/> Back to stops</button>
    <div className="screen-title">
      <span className="welcome-kicker">ROUTE REVIEW</span>
      <h1>Review your journeys</h1>
      <p>Check your departure times and preferred transport. Fixed appointments will not move.</p>
    </div>
    <div className="journey-list">
      {journeys.map((journey, index) => <article className="journey-editor-card" key={journey.tripId}>
        <div className="journey-editor-head">
          <span className="stop-number">{index + 1}</span>
          <div className="journey-route-label"><strong>{journey.origin}</strong><ArrowRight size={16}/><strong>{journey.destination}</strong></div>
        </div>
        <div className="journey-editor-departure">
          <label htmlFor={`journey-time-${index}`}>Leave at</label>
          <input id={`journey-time-${index}`} type="time" value={journey.departureTime}
            onChange={(e) => update(journey.tripId, { departureTime: e.target.value })}/>
          <span>{journey.arriveBy ? `Must arrive by ${journey.arriveBy}` : 'Return journey'}</span>
        </div>
        <div className="journey-mode-title">How will you travel?</div>
        <div className="mode-grid journey-mode-options">
          {modes.map((mode) => {
            const disabled = mode.value === 'bike' && !isDemo;
            return <button type="button" key={mode.value} className={journey.mode === mode.value ? 'selected' : ''}
              aria-pressed={journey.mode === mode.value} disabled={disabled}
              title={disabled ? 'Bicycle routes are unavailable from the live AWS provider' : mode.label}
              onClick={() => update(journey.tripId, { mode: mode.value as TransportMode })}>{mode.label}</button>;
          })}
        </div>
      </article>)}
    </div>
    {hasTransit && <div className="route-warning"><Info size={17}/> Live bus and metro availability varies by city. If Amazon Location cannot find transit, switch to Car or Walk. No substitute transit routes will be invented.</div>}
    <div className="review-actions">
      <div className="review-budget">
        <div><strong>Maximum extra travel</strong><p>Across the day, while prioritizing lower modeled exposure.</p></div>
        <div className="segmented">{[0,5,10,15].map((minutes) => <button type="button" key={minutes} className={maxExtra === minutes ? 'selected' : ''}
          onClick={() => setMaxExtra(minutes)}>{minutes ? '+' : ''}{minutes} min</button>)}</div>
      </div>
      {error && <div className="error-banner" role="alert">{error}{hasTransit && <button type="button" className="secondary" onClick={() =>
        setJourneys(journeys.map((journey) => ({ ...journey, mode: 'car' }))) }>Use Car for all journeys</button>}</div>}
      <button type="button" className="primary large full analyze-submit" onClick={onAnalyze} disabled={busy || !journeys.length}>
        {busy ? 'Analyzing routes and environmental conditions…' : 'Analyze & optimize my day'}
      </button>
    </div>
  </div>;
}
