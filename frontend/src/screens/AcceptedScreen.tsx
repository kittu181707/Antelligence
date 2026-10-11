import { CheckCircle2, Copy, ArrowRight, ShieldCheck } from 'lucide-react';
import type { AcceptedPlan } from '../types';
import { shortTime } from '../utils';

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function localDateToken() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function AcceptedScreen({ plan, onDone }: { plan: AcceptedPlan; onDone: () => void }) {
  const today = localDateToken();
  const next = plan.date > today
    ? plan.trips[0]
    : plan.date === today
      ? plan.trips.find((trip) => minutes(trip.recommended.departureTime) >= currentMinutes()) || plan.trips.at(-1)
      : undefined;

  const copy = () =>
    next &&
    navigator.clipboard?.writeText(
      `${next.origin} → ${next.destination}\nLeave ${next.recommended.departureTime}\n${next.recommended.label}`,
    );

  return (
    <div className="screen narrow accepted">
      <div className="card-ornament" style={{ justifyContent: 'center', marginBottom: '8px' }}>
        <CheckCircle2 size={54} className="emerald-accent" />
      </div>

      <p className="eyebrow">ACT VI · COMMITTED ITINERARY</p>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', margin: '8px 0 12px' }}>
        Your Lower-Exposure Day is Set.
      </h1>
      <p style={{ color: 'var(--ivory-muted)', fontSize: '14px', maxWidth: '480px', margin: '0 auto 24px' }}>
        Plan committed to your private DynamoDB record. Route waypoints and departure timings are locked in.
      </p>

      {next ? (
        <section className="renaissance-card next-trip" style={{ textAlign: 'left', marginBottom: '24px' }}>
          <span className="card-kicker">UPCOMING COMMUTE</span>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', margin: '4px 0 16px' }}>
            {next.origin} → {next.destination}
          </h2>

          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '0 0 18px 0' }}>
            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line-subtle)' }}>
              <dt style={{ fontSize: '11px', color: 'var(--gold)', textTransform: 'uppercase' }}>Departure Time</dt>
              <dd style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--ivory)' }}>
                {shortTime(next.recommended.departureTime)}
              </dd>
            </div>
            <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(46,196,125,0.1)', border: '1px solid var(--green)' }}>
              <dt style={{ fontSize: '11px', color: 'var(--green-bright)', textTransform: 'uppercase' }}>Recommended Route</dt>
              <dd style={{ margin: '4px 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--ivory)' }}>
                {next.recommended.label}
              </dd>
            </div>
          </dl>

          <button className="secondary full renaissance-btn-secondary" onClick={copy}>
            <Copy size={16} />
            <span>Copy Itinerary Details</span>
          </button>
        </section>
      ) : (
        <section className="renaissance-card next-trip" style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span className="card-kicker">ALL TRIPS COMPLETED</span>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', margin: '8px 0' }}>
            No remaining journeys in this plan for today.
          </h2>
        </section>
      )}

      <button className="primary full renaissance-btn-primary" onClick={onDone}>
        <span>Return to Environmental Command Center</span>
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
