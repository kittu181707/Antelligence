import { useRef } from 'react';
import { ArrowLeft, CalendarDays, LocateFixed, Plus, Trash2, Upload } from 'lucide-react';
import type { AgendaPayload, CalendarEvent, Coordinates } from '../types';
import { lastForecastDate, localDate, minutesToTime, timeToMinutes, uid } from '../utils';

const MAX_STOPS = 12;
function nextEnd(start: string) {
  return minutesToTime(Math.min(1439, timeToMinutes(start) + 45));
}
function newEvent(start: string): CalendarEvent {
  return { eventId: uid('event'), title: '', location: '', start, end: nextEnd(start), fixed: true };
}

/** One source of truth for the form and its map-side Review action. */
export function canReviewAgenda(agenda: AgendaPayload) {
  if (agenda.date < localDate() || agenda.date > lastForecastDate() ||
      !agenda.homeLocation.trim() || agenda.homeLocation.trim().toLowerCase() === 'home' ||
      !agenda.events.length || agenda.events.length > MAX_STOPS) return false;
  const ordered = [...agenda.events].sort((a, b) => a.start.localeCompare(b.start));
  return ordered.every((event, index) =>
    event.title.trim() && event.location.trim() &&
    timeToMinutes(event.end) > timeToMinutes(event.start) &&
    (index === 0 || timeToMinutes(event.start) >= timeToMinutes(ordered[index - 1].end))
  );
}

export function ImportScreen({ agenda, setAgenda, mode, onBack, onContinue, onIcs, busy, error, liveLocation }: {
  agenda: AgendaPayload;
  setAgenda: (agenda: AgendaPayload) => void;
  mode: 'import' | 'manual';
  onBack: () => void;
  onContinue: () => void;
  onIcs?: (file: File) => void;
  busy: boolean;
  error?: string;
  liveLocation?: Coordinates | null;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const ordered = [...agenda.events].sort((a, b) => a.start.localeCompare(b.start));
  const today = localDate();
  const forecastEnd = lastForecastDate();
  const invalidDate = agenda.date < today || agenda.date > forecastEnd;
  const dateWarning = agenda.date < today
    ? 'The selected day has passed in India. Choose today or a later date.'
    : 'Live environmental forecasts cover today and the next six days. Choose a nearer date.';
  const update = (id: string, patch: Partial<CalendarEvent>) => setAgenda({
    ...agenda, events: agenda.events.map((event) => event.eventId === id ? { ...event, ...patch } : event),
  });
  const add = () => {
    if (agenda.events.length >= MAX_STOPS) return;
    const last = ordered.at(-1);
    const nextMinutes = last ? Math.min(23 * 60, timeToMinutes(last.end) + 30) : 9 * 60;
    setAgenda({ ...agenda, events: [...agenda.events, newEvent(minutesToTime(nextMinutes))] });
  };
  const remove = (id: string) => setAgenda({ ...agenda, events: agenda.events.filter((event) => event.eventId !== id) });
  const useLocation = () => {
    if (!liveLocation) return;
    setAgenda({ ...agenda, homeLocation: `${liveLocation.lat.toFixed(6)}, ${liveLocation.lon.toFixed(6)}` });
  };
  const invalid = ordered.some((event, index) =>
    !event.location.trim() || !event.title.trim() || timeToMinutes(event.end) <= timeToMinutes(event.start)
    || (index > 0 && timeToMinutes(event.start) < timeToMinutes(ordered[index - 1].end))
  );
  return <div className="screen itinerary-editor">
    <button className="back" onClick={onBack}><ArrowLeft size={17}/> Back to today</button>
    <div className="screen-title">
      <span className="welcome-kicker">PERSONALIZED DAILY ROUTES</span>
      <h1>Plan your day</h1>
      <p>Add stops in any order. We place each location on the map as you enter it, then calculate actual road routes after analysis.</p>
    </div>
    <div className="itinerary-section">
      <div className="itinerary-topline">
        <label htmlFor="day-date"><CalendarDays size={16}/> Date</label>
        <input id="day-date" type="date" min={today} max={forecastEnd} value={agenda.date} onChange={(e) => setAgenda({ ...agenda, date: e.target.value })}/>
      </div>
      {invalidDate && <div role="alert" className="editor-warning">{dateWarning} <button type="button" className="secondary" onClick={() => setAgenda({ ...agenda, date: today })}>Use today</button></div>}
      <label htmlFor="origin-input">Start location</label>
      <div className="origin-row">
        <input id="origin-input" value={agenda.homeLocation === 'Home' ? '' : agenda.homeLocation}
          onChange={(e) => setAgenda({ ...agenda, homeLocation: e.target.value })} placeholder="Enter your starting address or use GPS" />
        <button className="secondary" onClick={useLocation} disabled={!liveLocation} title={liveLocation ? 'Use your live GPS position' : 'Allow browser location permission'}><LocateFixed size={17}/> Use my location</button>
      </div>
      <p className="fine-print">{liveLocation ? 'Your location was detected. You can use it or enter another address.' : 'Allow location access in your browser, or enter a starting address.'}</p>
    </div>
    {mode === 'import' && <div className="itinerary-section">
      <h3>Import calendar events</h3>
      <input ref={uploadRef} type="file" accept=".ics,text/calendar" onChange={(e) => { const file=e.target.files?.[0]; if (file) onIcs?.(file); }} />
      <button className="secondary" disabled={busy} onClick={() => uploadRef.current?.click()}><Upload size={17}/> Import .ics file</button>
      <p className="fine-print">Or add and edit stops manually below.</p>
    </div>}
    <div className="itinerary-stops-head"><h3>Scheduled stops <span>{agenda.events.length}/{MAX_STOPS}</span></h3></div>
    <div className="itinerary-list">
      {ordered.map((event, index) => <div className="itinerary-stop" key={event.eventId}>
        <div className="stop-number">{index + 1}</div>
        <div className="stop-inputs">
          <input aria-label={`Stop ${index + 1} name`} placeholder="Stop name (Gym, Work, Lunch…)" value={event.title}
            onChange={(e) => update(event.eventId, { title: e.target.value })}/>
          <input aria-label={`Stop ${index + 1} destination`} placeholder="Address or place to find on map" value={event.location}
            onChange={(e) => update(event.eventId, { location: e.target.value })}/>
          <div className="stop-time-grid">
            <label>Arrive <input aria-label={`Stop ${index + 1} arrival`} type="time" value={event.start}
              onChange={(e) => update(event.eventId, { start: e.target.value, end: nextEnd(e.target.value) })}/></label>
            <label>Leave <input aria-label={`Stop ${index + 1} departure`} type="time" value={event.end}
              onChange={(e) => update(event.eventId, { end: e.target.value })}/></label>
          </div>
        </div>
        <button className="icon-button" aria-label={`Remove stop ${index + 1}`} onClick={() => remove(event.eventId)}><Trash2 size={17}/></button>
      </div>)}
    </div>
    <button className="dashed itinerary-add" disabled={agenda.events.length >= MAX_STOPS} onClick={add}><Plus size={17}/> Add another stop</button>
    {invalid && ordered.length > 0 && <div className="editor-warning">Complete each stop's name and address, and ensure appointment times don't overlap.</div>}
    {error && <div className="error-banner">{error}</div>}
    <button className="primary large full itinerary-submit" disabled={busy || !canReviewAgenda(agenda)} onClick={onContinue}>
      Review journeys
    </button>
  </div>;
}
