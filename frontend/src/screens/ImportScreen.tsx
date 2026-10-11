import { useRef } from 'react';
import { ArrowLeft, FileUp, Plus, Trash2, ArrowRight, Calendar } from 'lucide-react';
import type { AgendaPayload, CalendarEvent } from '../types';
import { uid } from '../utils';

export function ImportScreen({
  agenda,
  setAgenda,
  mode,
  onBack,
  onContinue,
  onIcs,
  busy,
  error,
}: {
  agenda: AgendaPayload;
  setAgenda: (agenda: AgendaPayload) => void;
  mode: 'import' | 'manual';
  onBack: () => void;
  onContinue: () => void;
  onIcs: (file: File) => void;
  busy: boolean;
  error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<CalendarEvent>) =>
    setAgenda({
      ...agenda,
      events: agenda.events.map((event) => (event.eventId === id ? { ...event, ...patch } : event)),
    });

  const add = () =>
    setAgenda({
      ...agenda,
      events: [
        ...agenda.events,
        { eventId: uid('event'), title: '', location: '', start: '09:00', end: '10:00', fixed: true },
      ],
    });

  const remove = (id: string) =>
    setAgenda({ ...agenda, events: agenda.events.filter((event) => event.eventId !== id) });

  return (
    <div className="screen wide">
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        <span>Return to Command Center</span>
      </button>

      <div className="screen-title">
        <p className="eyebrow">ITINERARY INGESTION · CALENDAR & EVENTS</p>
        <h1>Define Today's Schedule</h1>
        <p>
          Fixed appointments remain immutable. Specify locations and timings so the optimizer can
          calculate lowest-exposure corridors between stops.
        </p>
      </div>

      <div className="toolbar-card renaissance-card">
        <div>
          <label style={{ color: 'var(--gold)' }}>Home / Departure Baseline Location</label>
          <input
            value={agenda.homeLocation}
            onChange={(e) => setAgenda({ ...agenda, homeLocation: e.target.value })}
            placeholder="e.g. Brodipet, Guntur or Connaught Place, Delhi"
            style={{ marginTop: '6px' }}
          />
        </div>
        {mode === 'import' && (
          <>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".ics,text/calendar"
              onChange={(e) => e.target.files?.[0] && onIcs(e.target.files[0])}
            />
            <button
              className="secondary renaissance-btn-secondary"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp size={16} />
              <span>{busy ? 'Importing iCal…' : 'Upload .ICS Calendar'}</span>
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="error-banner renaissance-error-banner">
          <span>{error}</span>
        </div>
      )}

      <div className="event-list">
        {agenda.events.map((event, index) => (
          <article className="event-card renaissance-card" key={event.eventId}>
            <div className="event-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="event-fields">
              <input
                className="event-title"
                value={event.title}
                placeholder="Appointment or Event Title"
                onChange={(e) => update(event.eventId, { title: e.target.value })}
              />
              <input
                value={event.location}
                placeholder="Destination Address or Area"
                onChange={(e) => update(event.eventId, { location: e.target.value })}
              />
              <div className="time-row">
                <label>
                  <span>Start Time</span>
                  <input
                    type="time"
                    value={event.start}
                    onChange={(e) => update(event.eventId, { start: e.target.value })}
                  />
                </label>
                <label>
                  <span>End Time</span>
                  <input
                    type="time"
                    value={event.end}
                    onChange={(e) => update(event.eventId, { end: e.target.value })}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={event.fixed}
                    onChange={(e) => update(event.eventId, { fixed: e.target.checked })}
                  />
                  <span>Fixed Appointment</span>
                </label>
              </div>
            </div>
            <button className="icon-button danger" onClick={() => remove(event.eventId)} aria-label="Remove event">
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>

      <button className="dashed" onClick={add} style={{ margin: '14px 0' }}>
        <Plus size={16} />
        <span>Add Destination Event Manually</span>
      </button>

      <div className="sticky-actions">
        <button
          className="primary large renaissance-btn-primary"
          disabled={!agenda.events.length || agenda.events.some((e) => !e.title || !e.location)}
          onClick={onContinue}
        >
          <span>Continue to Travel Parameters</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
