import { Search, ArrowRight, ArrowUpRight, Calendar, CalendarDays, MapPin, Navigation2, CheckCircle2, PlayCircle, AlertTriangle, ArrowDown, Clock3, Sun, Wind, HelpCircle, Route, ShieldCheck, Sparkles } from 'lucide-react';
import type { AgendaPayload, JourneyInput, DayAnalysis, TripAnalysis, Coordinates } from '../types';
import { shortTime } from '../utils';

export function TodayScreen({
  agenda,
  journeys,
  analysis,
  busy,
  isDemo,
  liveLocation,
  onImport,
  onManual,
  onDemo,
  onAnalyze,
  error,
  mapComponent,
  whyText,
  whyTrip,
  onWhy
}: {
  agenda: AgendaPayload;
  journeys: JourneyInput[];
  analysis?: DayAnalysis | null;
  busy: boolean;
  isDemo: boolean;
  liveLocation?: Coordinates | null;
  onImport: () => void;
  onManual: () => void;
  onDemo: () => void;
  onAnalyze: () => void;
  error?: string;
  mapComponent?: React.ReactNode;
  whyText?: string;
  whyTrip?: TripAnalysis | null;
  onWhy?: (trip: TripAnalysis) => void;
}) {
  const hasAgenda = agenda && agenda.events.length > 0;
  const m = analysis?.metrics;

  return (
    <div className={`dashboard-container ${!hasAgenda ? 'landing-dashboard' : ''}`}>

      {error && <div className="error-banner"><AlertTriangle size={16}/> {error}</div>}

      {/* MIDDLE SECTION */}
      <div className="dashboard-middle">
        <div className="journeys-col today-journeys">
          {!hasAgenda ? (
            <>
              <section className="landing-hero" aria-labelledby="landing-pitch">
                <div className="landing-hero-main">
                  <p className="landing-kicker"><span className="landing-kicker-dot" /> THE SMARTER WAY THROUGH YOUR DAY</p>
                  <h2 id="landing-pitch">Go places.<span>Breathe a little easier.</span></h2>
                  <p className="landing-description">Your schedule stays yours. Explore routes that account for modeled air quality and outdoor conditions—not just the fastest way there.</p>
                  <div className="landing-cta-stack">
                    <button className="primary landing-primary" onClick={onManual} disabled={busy}>
                      <MapPin size={19} aria-hidden="true"/> <span>Enter your day</span> <ArrowUpRight size={18} aria-hidden="true"/>
                    </button>
                    <button className="secondary landing-demo" onClick={onDemo} disabled={busy}>
                      <PlayCircle size={18} aria-hidden="true"/> {busy ? 'Preparing judge demo…' : 'Try judge demo · 1 click'}
                    </button>
                    <button className="text-button landing-import" onClick={onImport} disabled={busy}
                      title="Import a .ics calendar file exported from Google Calendar or Apple Calendar">
                      <Calendar size={16} aria-hidden="true"/> Import calendar <ArrowRight size={15} aria-hidden="true"/>
                    </button>
                    <span className="landing-calendar-hint">Google / Apple Calendar · export an .ics file</span>
                  </div>
                </div>
                <div className="landing-hero-aside" aria-label="Your whole day considered">
                  <span className="landing-aside-label">NOT JUST THE SHORTEST PATH</span>
                  <div className="landing-aside-track" aria-hidden="true">
                    <span className="landing-aside-dot first"/><span className="landing-aside-connector"/><span className="landing-aside-dot middle"/><span className="landing-aside-connector"/><span className="landing-aside-dot last"/>
                  </div>
                  <div className="landing-aside-points">
                    <span>Your schedule</span>
                    <span>Cleaner alternatives</span>
                    <span>One practical plan</span>
                  </div>
                  <p>Keep appointments fixed. Compare feasible journeys.</p>
                </div>
              </section>
              <section className="landing-method" aria-label="How your environmental planner works">
                <div className="landing-section-heading">
                  <div>
                    <span className="landing-section-kicker">HOW IT WORKS</span>
                    <h3>A better day, in three steps</h3>
                  </div>
                  <span className="landing-section-hint">Plan · Compare · Decide</span>
                </div>
                <div className="landing-method-grid">
                  <article className="landing-method-card">
                    <div className="landing-method-top"><span className="landing-method-icon"><CalendarDays size={19}/></span><span className="landing-method-number">01</span></div>
                    <h4>Plan your stops</h4>
                    <p>Add gym, work, errands and the times you need to be there.</p>
                  </article>
                  <article className="landing-method-card">
                    <div className="landing-method-top"><span className="landing-method-icon"><Navigation2 size={19}/></span><span className="landing-method-number">02</span></div>
                    <h4>Explore better routes</h4>
                    <p>Compare feasible journeys using forecast environmental conditions.</p>
                  </article>
                  <article className="landing-method-card">
                    <div className="landing-method-top"><span className="landing-method-icon"><CheckCircle2 size={19}/></span><span className="landing-method-number">03</span></div>
                    <h4>See the tradeoffs</h4>
                    <p>Review travel time, modeled exposure and route details.</p>
                  </article>
                </div>
              </section>
              <div className="landing-provenance">
                <span><span className="landing-provenance-dot"/> Live routing via Amazon Location and AWS</span>
                <span>Environmental readings are modeled estimates, not personal exposure measurements.</span>
              </div>
            </>
          ) : (
          <>
              <div className="results-journeys-heading">
                <div>
                  <span className="results-eyebrow">YOUR DAY AT A GLANCE</span>
                  <h3>Today's journeys</h3>
                </div>
                <span className="results-journey-count">{journeys.length} {journeys.length === 1 ? 'journey' : 'journeys'} planned</span>
              </div>
              <div className="timeline results-timeline">
                {journeys.map((journey) => (
                  <div key={journey.tripId} className="timeline-row">
                    <div className="time">{journey.departureTime}</div>
                    <div className="timeline-dot"></div>
                    <div className="journey-summary">
                      <div className="journey-route">
                        <strong>{journey.origin}</strong> <ArrowRight size={14}/> <strong>{journey.destination}</strong>
                      </div>
                      <div className="journey-meta"><span>{journey.mode}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              {!analysis && (
                <div style={{ marginTop: '24px' }}>
                  <button className="primary large full" onClick={onAnalyze} disabled={busy}>
                    {busy ? <Search className="spin" size={20}/> : <Search size={20}/>}
                    <span>Optimize my day</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

          {/* BOTTOM SECTION */}
          {analysis && m && (
            <div className="dashboard-bottom">
              <div className="dashboard-card analysis-card">
                <h3><ShieldCheck size={17} aria-hidden="true"/> Journey analysis</h3>
                <section className="exposure-hero">
                  <div><span>Original</span><strong>{m.originalExposureIndex}</strong></div>
                  <ArrowRight/>
                  <div className="optimized"><span>Optimized</span><strong>{m.optimizedExposureIndex}</strong></div>
                  <div className="delta">
                    <ArrowDown size={14} style={{verticalAlign:'middle'}}/> {m.exposureReductionPct}% <small>less exposure</small>
                  </div>
                </section>
                <div className="metric-grid">
                  <div><Clock3 size={16}/><span>Extra travel</span><strong>+{m.extraTravelMinutes} min</strong></div>
                  <div><Sun size={16}/><span>High-UV time</span><strong>{m.originalHighUvMinutes ? `-${Math.max(0, Math.round((1 - m.optimizedHighUvMinutes / m.originalHighUvMinutes) * 100))}%` : '0 min'}</strong></div>
                </div>
              </div>

              <div className="dashboard-card comparison-card">
                <h3><Route size={17} aria-hidden="true"/> Route comparison</h3>
                {analysis.changes.length > 0 ? (
                  <div className="change-list" style={{ margin: 0 }}>
                    {analysis.changes.slice(0, 1).map((trip) => (
                      <div key={trip.tripId} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="change-heading">
                          <div>
                            <h2>{shortTime(trip.recommended.departureTime)} · {trip.origin} → {trip.destination}</h2>
                          </div>
                          <button className="text-button" onClick={() => onWhy?.(trip)} style={{ padding: 0 }}><HelpCircle size={16}/></button>
                        </div>
                        <div className="compare-grid" style={{ margin: 0, gap: '8px' }}>
                          <div style={{ padding: '8px' }}>
                            <p style={{fontSize: '10px', margin: 0}}>ORIGINAL</p>
                            <strong style={{fontSize: '12px'}}>{trip.original.label}</strong>
                          </div>
                          <ArrowRight size={14}/>
                          <div className="recommended" style={{ padding: '8px' }}>
                            <p style={{fontSize: '10px', margin: 0}}>RECOMMENDED</p>
                            <strong style={{fontSize: '12px'}}>{trip.recommended.label}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                    {analysis.changes.length > 1 && <div style={{fontSize: '12px', color: 'var(--muted)'}}>+ {analysis.changes.length - 1} more changes</div>}
                  </div>
                ) : (
                  <div className="results-empty-state">
                    <span className="results-empty-symbol"><CheckCircle2 size={22} aria-hidden="true"/></span>
                    <strong>No changes recommended</strong>
                    <p>Your routes are already the best fit among the alternatives evaluated.</p>
                  </div>
                )}
              </div>

              <div className="dashboard-card why-card">
                <h3><Sparkles size={17} aria-hidden="true"/> Why this result?</h3>
                {whyText ? (
                  <div className="why-copy" style={{ fontSize: '13px', lineHeight: 1.5 }}>
                    {whyText}
                  </div>
                ) : analysis.changes.length > 0 ? (
                  <div className="results-empty-state">
                    <span className="results-empty-symbol"><Sparkles size={22} aria-hidden="true"/></span>
                    <strong>Explore the reasoning</strong>
                    <p>Select the help icon on a recommended route to see the modeled trade-offs.</p>
                  </div>
                ) : (
                  <div className="results-empty-state">
                    <span className="results-empty-symbol"><CheckCircle2 size={22} aria-hidden="true"/></span>
                    <strong>Stay with your plan</strong>
                    <p>No improvement was found within your selected travel limits.</p>
                  </div>
                )}
              </div>
            </div>
          )}


    </div>
  );
}
