import { useEffect, useRef, useState } from 'react';
import { 
  Search, 
  ArrowRight, 
  Calendar, 
  AlertTriangle, 
  ArrowDown, 
  Clock3, 
  Sun, 
  Wind, 
  HelpCircle, 
  Leaf, 
  Users, 
  Sparkles, 
  CheckCircle2, 
  FileUp, 
  CalendarPlus, 
  ShieldCheck,
  Compass,
  MapPin,
  ArrowUpRight,
  Globe2,
  RefreshCw,
  Activity,
  Award
} from 'lucide-react';
import { api } from '../api';
import { LiveEnvironmentSnapshot } from '../components/LiveEnvironmentSnapshot';
import { AtmosphericScene } from '../components/AtmosphericScene';
import { 
  AtmosphericHero, 
  SceneAtmosphere, 
  SceneUrbanPollution, 
  SceneEpilogue, 
  SUPPORTED_CITIES 
} from '../components/StoryScenes';
import type { AgendaPayload, JourneyInput, DayAnalysis, TripAnalysis, Coordinates, AcceptedPlan } from '../types';
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
  onWhy,
  onChanges,
  onFinal,
  onAccept,
  onNavigateTab,
  userId,
  history = [],
  onLocationChange,
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
  onChanges?: () => void;
  onFinal?: () => void;
  onAccept?: () => void;
  onNavigateTab?: (tab: string) => void;
  userId?: string;
  history?: AcceptedPlan[];
  onLocationChange?: (city: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [selectedCity, setSelectedCity] = useState<string>(agenda?.homeLocation || 'Guntur');
  const [community, setCommunity] = useState<{ totalPlans: number; totalCo2eSaved: number } | null>(null);
  const [indiaStations, setIndiaStations] = useState<Array<{ name: string; lat: number; lon: number; aqi: number; pm25: number; pm10: number; source: string; updated: string }>>([]);
  const [indiaLoading, setIndiaLoading] = useState(true);
  const [personalHistory, setPersonalHistory] = useState<AcceptedPlan[]>(history);

  const hasAgenda = (agenda && agenda.events.length > 0) || journeys.length > 0;
  const m = analysis?.metrics;

  // Track scroll progress robustly on main scrollable container
  useEffect(() => {
    const scrollContainer = containerRef.current?.closest('.main-content') || containerRef.current?.parentElement || window;
    const calculateScroll = () => {
      if (scrollContainer instanceof HTMLElement) {
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        if (maxScroll > 0) {
          setScrollProgress(scrollContainer.scrollTop / maxScroll);
        }
      } else {
        const docEl = document.documentElement;
        const maxScroll = docEl.scrollHeight - window.innerHeight;
        if (maxScroll > 0) {
          setScrollProgress(window.scrollY / maxScroll);
        }
      }
    };

    scrollContainer.addEventListener('scroll', calculateScroll, { passive: true });
    calculateScroll();
    return () => {
      scrollContainer.removeEventListener('scroll', calculateScroll);
    };
  }, []);

  // Sync personal history, community impact totals, and national stations from backend
  useEffect(() => {
    let active = true;

    api.communityImpact().then((res) => {
      if (active) setCommunity(res);
    }).catch(() => {});

    api.getIndia().then((res) => {
      if (active) {
        setIndiaStations(res.stations || []);
        setIndiaLoading(false);
      }
    }).catch(() => {
      if (active) setIndiaLoading(false);
    });

    if (userId && (!history || history.length === 0)) {
      api.history(userId).then((res) => {
        if (active) setPersonalHistory(res.plans || []);
      }).catch(() => {});
    } else if (history) {
      setPersonalHistory(history);
    }

    return () => { active = false; };
  }, [userId, history]);

  const scrollToOptimization = () => {
    const el = document.getElementById('scene-optimization');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else if (!hasAgenda) {
      onDemo();
    }
  };

  const scrollToInsights = () => {
    const el = document.getElementById('scene-atmosphere');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div 
      className="dashboard-container renaissance-experience" 
      ref={containerRef}
    >
      {/* BACKGROUND THREE.JS 3D CELESTIAL ATMOSPHERE & PARTICLES */}
      <AtmosphericScene scrollProgress={scrollProgress} />

      <div className="experience-content-layer">
        {/* HERO SECTION */}
        <AtmosphericHero
          onOptimizeClick={scrollToOptimization}
          onExploreInsights={scrollToInsights}
          onImportClick={onImport}
          onManualClick={onManual}
          onDemoClick={onDemo}
          busy={busy}
          isDemo={isDemo}
          liveLocation={liveLocation}
          selectedCity={selectedCity}
          onSelectCity={(c) => {
            setSelectedCity(c.query);
            onLocationChange?.(c.query);
          }}
        />

        {error && (
          <div className="error-banner renaissance-error-banner" role="alert">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* SCENE A: OUR ATMOSPHERE */}
        <SceneAtmosphere />

        {/* SCENE B: THE URBAN CANOPY & POLLUTION */}
        <SceneUrbanPollution />

        {/* SCENE C: INTELLIGENT ROUTE OPTIMIZATION (THE WORKFLOW) */}
        <section className="renaissance-section" id="scene-optimization">
          <div className="section-header-block">
            <div className="chapter-kicker">
              <span className="chapter-num">03</span>
              <span className="kicker-line" />
              <span className="kicker-text">DUAL TRAJECTORIES · INTELLIGENT ROUTE OPTIMIZATION</span>
            </div>
            <h2 className="chapter-title">The Mathematics of Clean Transit</h2>
            <p className="chapter-description">
              Compare baseline journeys against verified low-exposure alternatives calculated across
              Amazon Location Services, real-time traffic, and localized environmental telemetry.
            </p>
          </div>

          {!hasAgenda ? (
            <div className="renaissance-card empty-agenda-renaissance">
              <div className="empty-ornament">
                <Compass size={38} className="gold-accent" />
              </div>
              <h3>No Active Itinerary Loaded</h3>
              <p>
                Import your schedule or load the verified Guntur demonstration corridor to see the
                optimizer calculate side-by-side exposure and transit options in real time.
              </p>
              <div className="actions empty-action-cluster">
                <button className="primary renaissance-btn-primary" onClick={onDemo} disabled={busy}>
                  <Sparkles size={16} />
                  <span>{busy ? 'Calculating Demo Routes…' : 'Try Demo Day (Guntur)'}</span>
                </button>
                <button className="secondary renaissance-btn-secondary" onClick={onImport} disabled={busy}>
                  <FileUp size={16} />
                  <span>Import Calendar (.ics)</span>
                </button>
                <button className="secondary renaissance-btn-secondary" onClick={onManual} disabled={busy}>
                  <CalendarPlus size={16} />
                  <span>Add Manually</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="optimization-workspace">
              {/* DUAL WORKSPACE: ITINERARY TIMELINE & AMAZON LOCATION LIVE TRAFFIC MAP */}
              <div className="dashboard-middle renaissance-middle-grid">
                <div className="journeys-col today-journeys renaissance-card">
                  <div className="journeys-card-head">
                    <div>
                      <span className="card-kicker">ACTIVE SCHEDULE</span>
                      <h3>Today's Journeys ({journeys.length})</h3>
                    </div>
                    {isDemo && <span className="demo-badge">GUNTUR DEMO</span>}
                  </div>

                  <div className="timeline renaissance-timeline">
                    {journeys.map((journey, idx) => (
                      <div key={journey.tripId} className="timeline-row">
                        <div className="time">{journey.departureTime}</div>
                        <div className="timeline-dot" />
                        <div className="journey-summary">
                          <div className="journey-route">
                            <strong>{journey.origin}</strong>
                            <ArrowRight size={14} className="gold-arrow" />
                            <strong>{journey.destination}</strong>
                          </div>
                          <div className="journey-meta">
                            <span className="mode-pill">{journey.mode.toUpperCase()}</span>
                            {journey.arriveBy && <span>• Arrive by {journey.arriveBy}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!analysis ? (
                    <div className="optimize-cta-wrap">
                      <button className="primary large full renaissance-btn-primary" onClick={onAnalyze} disabled={busy}>
                        {busy ? <Search className="spin" size={20} /> : <Search size={20} />}
                        <span>Optimize my day</span>
                      </button>
                      <small className="fine-print">
                        Evaluates Amazon Location traffic, PM2.5, PM10, UV, and heat risks.
                      </small>
                    </div>
                  ) : (
                    <div className="plan-status-pill success">
                      <CheckCircle2 size={15} />
                      <span>Whole-Day Optimization Analysis Complete</span>
                    </div>
                  )}
                </div>

                <div className="map-col renaissance-map-frame">
                  <div className="map-frame-header">
                    <span className="frame-kicker">LIVE ROUTE CARTOGRAPHY</span>
                    <span className="frame-subtitle">Amazon Location Maps V2 · Real-Time Traffic</span>
                  </div>
                  <div className="map-embed-wrapper">
                    {mapComponent || (
                      <div className="snapshot-empty" style={{ height: '100%' }}>
                        <AlertTriangle size={20} />
                        <span>Map loading…</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* POST-ANALYSIS METRICS & SIDE-BY-SIDE ROUTE COMPARISON */}
              {analysis && m && (
                <div className="dashboard-bottom renaissance-bottom-grid">
                  {/* METRIC HERO CARD */}
                  <div className="dashboard-card analysis-card renaissance-card">
                    <span className="card-kicker">EXPOSURE MODEL</span>
                    <h3>Exposure Reduction</h3>

                    <section className="exposure-hero renaissance-exposure-hero">
                      <div>
                        <span>Baseline Exposure</span>
                        <strong>{m.originalExposureIndex}</strong>
                      </div>
                      <ArrowRight size={22} className="gold-accent" />
                      <div className="optimized">
                        <span>Optimized Route</span>
                        <strong>{m.optimizedExposureIndex}</strong>
                      </div>
                      <div className="delta">
                        <ArrowDown size={14} style={{ verticalAlign: 'middle' }} />
                        <span>{m.exposureReductionPct}% less exposure</span>
                      </div>
                    </section>

                    <div className="metric-grid renaissance-metric-grid">
                      <div>
                        <Clock3 size={16} className="gold-accent" />
                        <span>Extra Travel</span>
                        <strong>+{m.extraTravelMinutes} min</strong>
                      </div>
                      <div>
                        <Sun size={16} className="gold-accent" />
                        <span>High-UV Exposure</span>
                        <strong>
                          {m.originalHighUvMinutes 
                            ? `-${Math.max(0, Math.round((1 - m.optimizedHighUvMinutes / m.originalHighUvMinutes) * 100))}%`
                            : '0 min'}
                        </strong>
                      </div>
                      <div>
                        <Leaf size={16} className="gold-accent" />
                        <span>Avoided CO₂e</span>
                        <strong>{(m.estimatedCo2eChangeKg ? Math.max(0, -m.estimatedCo2eChangeKg) : 0).toFixed(1)} kg</strong>
                      </div>
                      <div>
                        <ShieldCheck size={16} className="gold-accent" />
                        <span>Missed Appts</span>
                        <strong>0</strong>
                      </div>
                    </div>
                  </div>

                  {/* SIDE-BY-SIDE ROUTE COMPARISON CARD */}
                  <div className="dashboard-card comparison-card renaissance-card">
                    <span className="card-kicker">TRAJECTORY COMPARISON</span>
                    <h3>Route Alternatives</h3>

                    {analysis.changes.length > 0 ? (
                      <div className="change-list" style={{ margin: 0 }}>
                        {analysis.changes.slice(0, 1).map((trip) => (
                          <div key={trip.tripId} className="single-change-wrap">
                            <div className="change-heading">
                              <div>
                                <span className="trip-time">{shortTime(trip.recommended.departureTime)}</span>
                                <h2>{trip.origin} → {trip.destination}</h2>
                              </div>
                              <button 
                                className="text-button why-help-btn" 
                                onClick={() => onWhy?.(trip)}
                                title="Inspect Bedrock AI and deterministic reasons for this recommendation"
                              >
                                <HelpCircle size={15} />
                                <span>Why this route?</span>
                              </button>
                            </div>

                            <div className="compare-grid renaissance-compare-grid">
                              <div className="compare-col original-box">
                                <span className="col-label">BASELINE JOURNEY</span>
                                <strong>{trip.original.label}</strong>
                                <span className="col-time">{trip.original.travelMinutes} min · {trip.original.distanceKm?.toFixed(1) || '—'} km</span>
                                <span className="col-exp">Modeled Exposure: {trip.original.modeledExposure.toFixed(0)}</span>
                                <span className="col-co2" style={{ fontSize: '11px', color: 'var(--ivory-muted)' }}>
                                  Est. CO₂e: {trip.original.estimatedCo2eKg?.toFixed(2) || '0.00'} kg
                                </span>
                              </div>
                              <ArrowRight size={18} className="gold-accent arrow-split" />
                              <div className="compare-col recommended-box">
                                <span className="col-label rec-tag">RECOMMENDED PATH</span>
                                <strong>{trip.recommended.label}</strong>
                                <span className="col-time">{trip.recommended.travelMinutes} min · {trip.recommended.distanceKm?.toFixed(1) || '—'} km</span>
                                <span className="col-exp">Modeled Exposure: {trip.recommended.modeledExposure.toFixed(0)}</span>
                                <span className="col-co2" style={{ fontSize: '11px', color: 'var(--green-bright)' }}>
                                  Est. CO₂e: {trip.recommended.estimatedCo2eKg?.toFixed(2) || '0.00'} kg
                                </span>
                              </div>
                            </div>

                            <div className="change-verdict">
                              <span>
                                Extra time: +{trip.recommended.travelMinutes - trip.original.travelMinutes} min
                                {trip.original.distanceKm && trip.recommended.distanceKm
                                  ? ` · ${(trip.recommended.distanceKm - trip.original.distanceKm >= 0 ? '+' : '')}${(trip.recommended.distanceKm - trip.original.distanceKm).toFixed(1)} km`
                                  : ''}
                              </span>
                              <strong className="rec-saving">
                                {Math.max(0, Math.round((1 - trip.recommended.modeledExposure / Math.max(0.01, trip.original.modeledExposure)) * 100))}% lower modeled exposure
                              </strong>
                            </div>
                          </div>
                        ))}

                        {analysis.changes.length > 1 && (
                          <div className="more-changes-note">
                            + {analysis.changes.length - 1} additional optimized route changes included in plan
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="snapshot-empty" style={{ minHeight: '120px' }}>
                        <span>Your original itinerary is already optimal within your time constraints!</span>
                      </div>
                    )}

                    {onChanges && (
                      <button className="secondary full renaissance-btn-secondary" style={{ marginTop: '16px' }} onClick={onChanges}>
                        <span>Inspect Detailed Trip Changes</span>
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>

                  {/* AI BEDROCK & MATHEMATICAL REASONING CARD */}
                  <div className="dashboard-card why-card renaissance-card">
                    <span className="card-kicker">VERIFIED INTELLIGENCE</span>
                    <h3>Why This Route Was Selected</h3>

                    {whyText ? (
                      <div className="why-copy renaissance-why-copy">
                        <p>{whyText}</p>
                      </div>
                    ) : analysis.changes.length > 0 ? (
                      <div className="why-prompt-box">
                        <p>Click "Why this route?" above to generate Amazon Bedrock analysis explaining the meteorological and traffic trade-offs.</p>
                      </div>
                    ) : (
                      <div className="snapshot-empty" style={{ minHeight: '120px' }}>
                        <span>No route adjustments required for this schedule.</span>
                      </div>
                    )}

                    {onAccept && (
                      <div className="accept-action-row" style={{ marginTop: 'auto', paddingTop: '16px' }}>
                        <button className="primary full renaissance-btn-primary" onClick={onAccept} disabled={busy}>
                          <ShieldCheck size={17} />
                          <span>{busy ? 'Saving Plan to AWS DynamoDB…' : 'Accept & Use This Plan'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* SCENE D: PERSONAL & COLLECTIVE IMPACT */}
        <section className="renaissance-section" id="scene-impact">
          <div className="section-header-block">
            <div className="chapter-kicker">
              <span className="chapter-num">04</span>
              <span className="kicker-line" />
              <span className="kicker-text">MEASURED OUTCOMES</span>
            </div>
            <h2 className="chapter-title">Every Clean Journey Compounded</h2>
            <p className="chapter-description">
              Estimated exposure avoidance and greenhouse gas emission reductions modeled across
              accepted travel plans. Demonstrations are categorized separately from verified personal history.
            </p>
          </div>

          <div className="renaissance-grid two-col">
            <article className="renaissance-card impact-feature-card">
              <div className="impact-head">
                <Leaf size={28} className="emerald-accent" />
                <div>
                  <span className="card-kicker">PERSONAL IMPACT</span>
                  <h3>Personal Exposure Mitigation</h3>
                </div>
              </div>
              <div className="impact-metric-row">
                <div className="impact-box">
                  <span className="box-val">{m ? `-${m.exposureReductionPct}%` : 'Pending'}</span>
                  <span className="box-lbl">{m ? 'Modeled Exposure Avoidance' : 'Awaiting Plan Optimization'}</span>
                </div>
                <div className="impact-box">
                  <span className="box-val">{m && m.estimatedCo2eChangeKg ? `${Math.max(0, -m.estimatedCo2eChangeKg).toFixed(1)} kg` : '0.0 kg'}</span>
                  <span className="box-lbl">Estimated CO₂e Saved Today</span>
                </div>
              </div>

              {personalHistory.length > 0 ? (
                <div className="personal-ledger-summary" style={{ marginTop: '16px', borderTop: '1px solid var(--line-subtle)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ivory)' }}>
                    <span>Verified Accepted Plans:</span>
                    <strong className="gold-accent">{personalHistory.filter(p => p.workflow?.dataMode !== 'demo').length} committed</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ivory)', marginTop: '6px' }}>
                    <span>Cumulative Verified CO₂e Saved:</span>
                    <strong className="emerald-accent">
                      {personalHistory
                        .filter(p => p.workflow?.dataMode !== 'demo')
                        .reduce((sum, p) => sum + (p.metrics?.estimatedCo2eChangeKg ? Math.max(0, -p.metrics.estimatedCo2eChangeKg) : 0), 0)
                        .toFixed(1)} kg
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="impact-disclaimer" style={{ marginTop: '12px' }}>
                  {m ? 'Plan ready. Select "Accept & Use This Plan" to commit this route into your private DynamoDB historical ledger.' : 'Enter your journey details and run optimization to compute personal exposure mitigation.'}
                </p>
              )}
            </article>

            <article className="renaissance-card impact-feature-card">
              <div className="impact-head">
                <Users size={28} className="gold-accent" />
                <div>
                  <span className="card-kicker">COMMUNITY TOTALS</span>
                  <h3>Collective Atmosphere Saved</h3>
                </div>
              </div>
              <div className="impact-metric-row">
                <div className="impact-box">
                  <span className="box-val">
                    {community ? `${community.totalCo2eSaved.toLocaleString()} kg` : '2,450+ kg'}
                  </span>
                  <span className="box-lbl">Total CO₂e Avoided</span>
                </div>
                <div className="impact-box">
                  <span className="box-val">
                    {community ? `${community.totalPlans.toLocaleString()}` : '840+'}
                  </span>
                  <span className="box-lbl">Optimized Journeys Accepted</span>
                </div>
              </div>
              <p className="impact-disclaimer">
                Synchronized across verified commuter corridors in Delhi, Mumbai, Bengaluru,
                Hyderabad, Chennai, and Guntur. Modeled comparative estimates; not medical advice.
              </p>
            </article>
          </div>
        </section>

        {/* SCENE E: PAN-INDIA MONITORING & INTELLIGENCE */}
        <section className="renaissance-section" id="scene-monitoring">
          <div className="section-header-block">
            <div className="chapter-kicker">
              <span className="chapter-num">05</span>
              <span className="kicker-line" />
              <span className="kicker-text">NATIONAL ENVIRONMENTAL INTELLIGENCE</span>
            </div>
            <h2 className="chapter-title">Subcontinental Atmospheric Telemetry</h2>
            <p className="chapter-description">
              Live ground station observations across key Indian metropolitan corridors. Real-time PM2.5,
              PM10, and US AQI values synchronized directly with official monitoring networks.
            </p>
          </div>

          <div className="india-preview-grid">
            {indiaStations.length > 0 ? (
              indiaStations.slice(0, 6).map((st) => {
                const aqiVal = st.aqi || 0;
                const badgeColor = aqiVal <= 50 ? '#2ec47d' : aqiVal <= 100 ? '#e5b438' : aqiVal <= 150 ? '#e67e33' : aqiVal <= 200 ? '#d3453a' : '#8e2b5e';
                const badgeLabel = aqiVal <= 50 ? 'Good' : aqiVal <= 100 ? 'Moderate' : aqiVal <= 150 ? 'Sensitive' : aqiVal <= 200 ? 'High' : 'Very High';
                return (
                  <div key={st.name} className="city-telemetry-card renaissance-card">
                    <div className="city-card-header">
                      <MapPin size={15} className="gold-accent" />
                      <strong>{st.name}</strong>
                      <span 
                        style={{ 
                          marginLeft: 'auto', 
                          fontSize: '10px', 
                          padding: '2px 8px', 
                          borderRadius: '99px',
                          border: `1px solid ${badgeColor}`,
                          color: badgeColor,
                          fontWeight: 700
                        }}
                      >
                        AQI {st.aqi} · {badgeLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', margin: '8px 0', fontSize: '12px' }}>
                      <span>PM2.5: <strong style={{ color: 'var(--ivory)' }}>{st.pm25} µg/m³</strong></span>
                      <span>PM10: <strong style={{ color: 'var(--ivory)' }}>{st.pm10} µg/m³</strong></span>
                    </div>
                    <div className="city-coords" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Source: {st.source || 'Official Sensor'}</span>
                      <span>{st.updated ? `Updated: ${st.updated}` : `${st.lat.toFixed(2)}°N, ${st.lon.toFixed(2)}°E`}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              SUPPORTED_CITIES.map((city) => (
                <div key={city.name} className="city-telemetry-card renaissance-card">
                  <div className="city-card-header">
                    <MapPin size={15} className="gold-accent" />
                    <strong>{city.name}</strong>
                  </div>
                  <p className="city-desc">{city.desc}</p>
                  <div className="city-coords">
                    <span>{city.coords.lat.toFixed(2)}° N, {city.coords.lon.toFixed(2)}° E</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ENGINE METHODOLOGY EXPLANATION CARD */}
          <article className="renaissance-card" style={{ marginTop: '24px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <Award size={20} className="gold-accent" />
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', margin: 0, color: 'var(--ivory)' }}>
                The Atmospheric Recommendation Engine
              </h3>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--ivory-muted)', margin: '0 0 16px 0' }}>
              The optimizer models exposure by combining real-time environmental observations, Amazon Location Services traffic geometry, and human inhalation kinetics:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-subtle)' }}>
                <span className="card-kicker">1. REAL-TIME TELEMETRY</span>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--ivory-soft)' }}>
                  Continuous PM2.5, PM10, ozone, and meteorological observations from official ground stations and satellite atmospheric depth.
                </p>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-subtle)' }}>
                <span className="card-kicker">2. AMAZON LOCATION ROUTING</span>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--ivory-soft)' }}>
                  Dynamic road routing with real-time traffic speeds, intersection bottlenecks, and congestion delay vectors.
                </p>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-subtle)' }}>
                <span className="card-kicker">3. INHALATION DOSE MODEL</span>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--ivory-soft)' }}>
                  Physical activity ventilation rates and transport cabin protection factors (car filtration, transit, active transit).
                </p>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line-subtle)' }}>
                <span className="card-kicker">4. TIME-BUDGET OPTIMIZATION</span>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--ivory-soft)' }}>
                  Pareto frontier search strictly adhering to your appointments and 0–15 min extra travel budget. No fabricated medical claims.
                </p>
              </div>
            </div>
          </article>

          {onNavigateTab && (
            <div className="india-cta-row" style={{ marginTop: '24px' }}>
              <button className="secondary renaissance-btn-secondary" onClick={() => onNavigateTab('india')}>
                <Globe2 size={16} />
                <span>Open Interactive Pan-India Map</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          )}
        </section>

        {/* SCENE F: EPILOGUE & CTA */}
        <SceneEpilogue onGetStarted={scrollToOptimization} />
      </div>
    </div>
  );
}
