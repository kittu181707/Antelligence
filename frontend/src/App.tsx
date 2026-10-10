import { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { api } from './api';
import { BottomNav, type NavTab } from './components/BottomNav';
import { Drawer } from './components/Drawer';
import { AcceptedScreen } from './screens/AcceptedScreen';
import { AnalysisScreen } from './screens/AnalysisScreen';
import { ChangesScreen } from './screens/ChangesScreen';
import { FinalPlanScreen } from './screens/FinalPlanScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ImportScreen, canReviewAgenda } from './screens/ImportScreen';
import { LandingScreen } from './screens/LandingScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TravelScreen } from './screens/TravelScreen';
import { ImpactScreen } from './screens/ImpactScreen';
import { IndiaScreen } from './screens/IndiaScreen';
import { TodayScreen } from './screens/TodayScreen';
import { Map } from './components/Map';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveEnvironmentSnapshot } from './components/LiveEnvironmentSnapshot';
import type { AcceptedPlan, AgendaPayload, DayAnalysis, JourneyInput, TripAnalysis, Coordinates } from './types';
import { deriveJourneys, getUserId, localDate, lastForecastDate, readStoredNumber, storeNumber } from './utils';

const blankAgenda = (location?: Coordinates | null): AgendaPayload => ({ date: localDate(), homeLocation: location ? `${location.lat.toFixed(6)}, ${location.lon.toFixed(6)}` : 'Home', events: [] });
type Step = 'landing'|'import'|'manual'|'travel'|'analysis'|'overview'|'changes'|'final'|'accepted';
type AgendaMode = 'import' | 'manual';
const EMPTY_TRIPS: TripAnalysis[] = [];

export default function App() {
  const [step, setStep] = useState<Step>('landing');
  const [agendaMode, setAgendaMode] = useState<AgendaMode>('manual');
  const [agenda, setAgenda] = useState<AgendaPayload>(blankAgenda);
  const [journeys, setJourneys] = useState<JourneyInput[]>([]);
  const [maxExtra, setMaxExtraState] = useState(() => {
    const stored = readStoredNumber('max_extra_minutes', 10);
    return [0, 5, 10, 15].includes(stored) ? stored : 10;
  });
  const [analysis, setAnalysis] = useState<DayAnalysis | null>(null);
  const [accepted, setAccepted] = useState<AcceptedPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [whyTrip, setWhyTrip] = useState<TripAnalysis | null>(null);
  const [whyText, setWhyText] = useState('');
  const [tab, setTab] = useState<NavTab>('today');
  const [history, setHistory] = useState<AcceptedPlan[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [liveLocation, setLiveLocation] = useState<Coordinates | null>(null);
  const [userId, setUserId] = useState('');
  const [previewPoints, setPreviewPoints] = useState<{ id: string; label: string; point: Coordinates }[]>([]);
  const placeCache = useRef(new globalThis.Map<string, Coordinates>());
  const previousIndiaDay = useRef(localDate());

  useEffect(() => {
    let active = true;
    let watchId: number;

    void getUserId().then((value) => { if (active) setUserId(value); }).catch(() => {
      if (active) setError('Private session could not initialize. A secure browser connection is required.');
    });

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!active) return;
          const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          if (!Number.isFinite(next.lat) || !Number.isFinite(next.lon)) return;
          setLiveLocation((previous) =>
            previous && Math.abs(previous.lat - next.lat) < 0.00002 && Math.abs(previous.lon - next.lon) < 0.00002
              ? previous : next
          );
        },
        () => { if (active) setLiveLocation(null); },
        { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 10000 }
      );
    }

    return () => { 
      active = false; 
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, []);
  // Resolve itinerary stops after typing pauses. Result labels are map previews,
  // not claims of calculated road routes until a real analysis has completed.
  const itineraryPlaceKey = JSON.stringify({
    home: agenda.homeLocation,
    stops: agenda.events.map((event) => [event.eventId, event.title, event.location, event.start]),
  });
  useEffect(() => {
    let active = true;
    if (isDemo || analysis || (tab !== 'today' && tab !== 'map') || (step !== 'manual' && step !== 'import' && step !== 'travel')) {
      setPreviewPoints([]);
      return () => { active = false; };
    }
    // Keep successfully geocoded pins visible while the edited itinerary
    // re-resolves; immediately discard only pins for stops that were deleted.
    const ids = new Set(['preview-origin', ...agenda.events.map((event) => event.eventId)]);
    setPreviewPoints((previous) =>
      previous.every((point) => ids.has(point.id))
        ? previous : previous.filter((point) => ids.has(point.id)));
    const timer = window.setTimeout(() => {
      const coordinate = (value: string): Coordinates | null => {
        const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;
        const lat = Number(match[1]), lon = Number(match[2]);
        return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
      };
      const ordered = [...agenda.events].sort((a,b) => a.start.localeCompare(b.start));
      const locations = [
        { id: 'preview-origin', label: 'Starting location', location: agenda.homeLocation },
        ...ordered.map((event) => ({ id: event.eventId, label: event.title || event.location, location: event.location })),
      ];
      const collected: Array<{ id: string; label: string; point: Coordinates } | null> = Array(locations.length).fill(null);
      void (async () => {
        for (let index = 0; index < locations.length && active; index++) {
          const item = locations[index];
          const name = item.location.trim();
          if (!name || name.toLowerCase() === 'home') {
            if (index === 0 && liveLocation) collected[index] = { id: item.id, label: item.label, point: liveLocation };
          } else {
            let point = coordinate(name) || placeCache.current.get(name.toLowerCase());
            if (!point && name.length >= 3) {
              try {
                point = (await api.resolvePlace(name)).position;
                if (!active) return;
                if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) placeCache.current.set(name.toLowerCase(), point);
              } catch { /* User may still be typing an incomplete place. */ }
            }
            if (point) collected[index] = { id: item.id, label: item.label, point };
          }
          if (active) setPreviewPoints(collected.filter((p): p is NonNullable<typeof p> => p !== null));
        }
      })();
    }, 850);
    return () => { active = false; window.clearTimeout(timer); };
  }, [itineraryPlaceKey, isDemo, analysis, tab, step, liveLocation?.lat, liveLocation?.lon]);

  // Handle a long-running browser tab crossing midnight IST without turning
  // a previously valid 'today' itinerary into an invalid yesterday forecast.
  useEffect(() => {
    const rollover = () => {
      const next = localDate();
      const previous = previousIndiaDay.current;
      if (next === previous) return;
      previousIndiaDay.current = next;
      setAgenda((current) => !isDemo && current.date === previous
        ? { ...current, date: next } : current);
    };
    const interval = window.setInterval(rollover, 60_000);
    window.addEventListener('focus', rollover);
    document.addEventListener('visibilitychange', rollover);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', rollover);
      document.removeEventListener('visibilitychange', rollover);
    };
  }, [isDemo]);

  const setMaxExtra = (value: number) => { setMaxExtraState(value); storeNumber('max_extra_minutes', value); };

  const startAgenda = (mode: AgendaMode) => {
    setIsDemo(false);
    setAgenda(blankAgenda(liveLocation));
    setJourneys([]);
    setAnalysis(null);
    setPreviewPoints([]);
    setAgendaMode(mode);
    setStep(mode);
    setError(undefined);
  };

  const loadDemo = async () => {
    if (busy) return;
    setBusy(true); setError(undefined);
    try {
      const demo = await api.getDemoDay();
      const demoJourneys = deriveJourneys(demo.events, demo.homeLocation).map((journey, index) => ({
        ...journey,
        departureTime: ['07:45', '12:00', '17:45', '19:20'][index] || journey.departureTime,
        mode: (['car', 'metro', 'metro', 'bike'][index] || journey.mode) as JourneyInput['mode'],
      }));
      setIsDemo(true); setAgenda(demo); setJourneys(demoJourneys); setAgendaMode('manual');
      
      if (userId) {
        const result = await api.analyzeDay({ ...demo, userId, journeys: demoJourneys, maxExtraMinutes: maxExtra, demoMode: true });
        setAnalysis(result);
        if (result.changes.length > 0) {
          const whyResult = await api.explain(result.planId, result.changes[0]);
          setWhyText(whyResult.explanation);
        }
      }
      setStep('landing');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load demo day');
    } finally {
      setBusy(false);
    }
  };

  const importIcs = async (file: File) => {
    if (busy) return;
    if (file.size > 512_000) { setError('Calendar file must be smaller than 512 KB'); return; }
    setBusy(true); setError(undefined);
    try {
      const parsed = await api.parseIcs(await file.text());
      setAgenda({ ...parsed, homeLocation: agenda.homeLocation !== 'Home' ? agenda.homeLocation : (liveLocation ? `${liveLocation.lat.toFixed(6)}, ${liveLocation.lon.toFixed(6)}` : parsed.homeLocation) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse calendar');
    } finally {
      setBusy(false);
    }
  };

  const continueToTravel = () => {
    const newJourneys = deriveJourneys(agenda.events, agenda.homeLocation);
    // Keep user's customizations if the structure matches
    if (journeys.length === newJourneys.length && journeys.every((j, i) => j.origin === newJourneys[i].origin && j.destination === newJourneys[i].destination)) {
      // Structure matches, do not overwrite
    } else {
      setJourneys(newJourneys);
    }
    setStep('travel');
    setError(undefined);
  };

  const runAnalysis = async () => {
    if (busy) return;
    if (!isDemo && (agenda.date < localDate() || agenda.date > lastForecastDate())) {
      setStep(agendaMode);
      setError('Choose a day within the next seven days in India before analyzing your route.');
      return;
    }
    if (!agenda.events.length) { setStep('manual'); setError('Add at least one stop before analyzing your day.'); return; }
    const plannedJourneys = journeys.length ? journeys : deriveJourneys(agenda.events, agenda.homeLocation);
    if (!plannedJourneys.length) { setStep('manual'); setError('Add a destination to continue.'); return; }
    if (!userId) { setError('Private session is initializing. Please retry.'); return; }
    setStep('analysis'); setError(undefined); setBusy(true);
    try {
      const result = await api.analyzeDay({ ...agenda, userId, journeys: plannedJourneys, maxExtraMinutes: maxExtra, demoMode: isDemo });
      setAnalysis(result); 
      setJourneys(plannedJourneys);
      setTab('today');
      setStep('landing'); // Render dashboard
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setStep('travel');
    } finally {
      setBusy(false);
    }
  };

  const acceptPlan = async () => {
    if (!analysis || busy) return;
    if (!userId) { setError('Private session unavailable.'); return; }
    setBusy(true); setError(undefined);
    try {
      const saved = await api.acceptPlan(userId, analysis.planId);
      setAccepted(saved); setStep('accepted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save plan');
    } finally {
      setBusy(false);
    }
  };

  const openWhy = async (trip: TripAnalysis) => {
    setWhyTrip(trip); setWhyText(trip.explanation);
    try {
      if (!analysis) return;
      const result = await api.explain(analysis.planId, trip);
      setWhyText(result.explanation);
    } catch { /* verified deterministic explanation remains */ }
  };

  const refreshHistory = async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const result = await api.history(userId);
      setHistory(result.plans);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'History unavailable');
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { if (tab === 'history' && userId) void refreshHistory(); }, [tab, userId]);

  const onNav = (next: NavTab) => {
    setTab(next);
    // Returning from a map preview must not discard a partially edited day.
    if (next === 'today' && tab !== 'map') setStep('landing');
    if (next === 'optimize') {
      if (analysis) setStep('final');
      else if (agenda.events.length) continueToTravel();
      else { setAgenda(blankAgenda(liveLocation)); setAgendaMode('manual'); setStep('manual'); }
    }
  };


  let content;
  if (tab === 'history') content = <HistoryScreen plans={history} loading={historyLoading} onRefresh={refreshHistory}/>;
  else if (tab === 'settings') content = <SettingsScreen maxExtra={maxExtra} setMaxExtra={setMaxExtra}/>;
  else if (tab === 'impact') content = <ImpactScreen />;
  else if (tab === 'india') content = <IndiaScreen />;
  else if (step === 'landing') {
    content = <TodayScreen agenda={agenda} journeys={journeys} analysis={analysis} whyText={whyText} whyTrip={whyTrip} onWhy={openWhy} busy={busy} isDemo={isDemo} liveLocation={liveLocation} onImport={() => startAgenda('import')} onManual={() => startAgenda('manual')} onDemo={loadDemo} onAnalyze={runAnalysis} error={error} />;
  }
  else if (step === 'import' || step === 'manual') content = <ImportScreen agenda={agenda} setAgenda={setAgenda} mode={step} onBack={() => setStep('landing')} onContinue={continueToTravel} onIcs={importIcs} busy={busy} error={error} liveLocation={liveLocation}/>;
  else if (step === 'travel') content = <TravelScreen journeys={journeys} setJourneys={setJourneys} maxExtra={maxExtra} setMaxExtra={setMaxExtra} onBack={() => setStep(agendaMode)} onAnalyze={runAnalysis} isDemo={isDemo} busy={busy} error={error}/>;
  else if (step === 'analysis') content = <AnalysisScreen error={error} onBack={() => setStep('travel')}/>;
  else if (step === 'overview' && analysis) content = <OverviewScreen analysis={analysis} onChanges={() => setStep('changes')} onKeep={() => { setAnalysis(null); setStep('landing'); }}/>;
  else if (step === 'changes' && analysis) content = <ChangesScreen analysis={analysis} onBack={() => setStep('overview')} onWhy={openWhy} onFinal={() => setStep('final')}/>;
  else if (step === 'final' && analysis) content = <FinalPlanScreen analysis={analysis} onBack={() => setStep('changes')} onAccept={acceptPlan} busy={busy}/>;
  else if (step === 'accepted' && accepted) content = <AcceptedScreen plan={accepted} onDone={() => { setTab('today'); setStep('landing'); }}/>;
  else content = <TodayScreen agenda={agenda} journeys={journeys} analysis={analysis} whyText={whyText} whyTrip={whyTrip} onWhy={openWhy} busy={busy} isDemo={isDemo} liveLocation={liveLocation} onImport={() => startAgenda('import')} onManual={() => startAgenda('manual')} onDemo={loadDemo} onAnalyze={runAnalysis} error={error} />;

  return (
    <div className="app-container">
      <header className="app-topbar">
        <div className="app-welcome">
          <span className="welcome-kicker">YOUR DAILY ENVIRONMENTAL COMPANION</span>
          <h1>Good morning. <span>Here's your environmental plan for today.</span></h1>
        </div>
        <div className="top-environment">
          <ErrorBoundary label="Live conditions" compact><LiveEnvironmentSnapshot homeLocation={agenda.homeLocation} liveLocation={liveLocation} isDemo={isDemo} chipMode={true}/></ErrorBoundary>
        </div>
      </header>
      {tab === 'map' ? (
        <main className="fullpage-map-screen" aria-label="Full-page interactive map">
          <div className="fullpage-map-header">
            <div>
              <span className="welcome-kicker">EXPLORE YOUR JOURNEY</span>
              <h2>Live route map</h2>
              <p>{analysis?.trips.length
                ? `${analysis.trips.length} analyzed journey(s). Select numbered stops for details.`
                : previewPoints.length > 1
                  ? `${previewPoints.length - 1} planned stop(s). Dashed lines are previews, not road routes.`
                  : 'Your current location is shown when permission is enabled. Add stops to map a day.'}</p>
            </div>
            <button type="button" className="fullpage-map-back" onClick={() => onNav('today')}>Back to Today</button>
          </div>
          <div className="fullpage-map-canvas">
            <ErrorBoundary label="Full map" compact>
              <Map trips={analysis?.trips ?? EMPTY_TRIPS} liveLocation={liveLocation} isDemo={isDemo} previewPoints={previewPoints}/>
            </ErrorBoundary>
          </div>
        </main>
      ) : (
      <main className={`main-content global-split-layout ${tab === 'today' && (step === 'manual' || step === 'import') ? 'planner-layout' : tab === 'today' && step === 'landing' && !agenda.events.length ? 'landing-layout' : ''}`}>
        <section className="global-panel-col">
          {isDemo && <div className="demo-banner">DEMO MODE · Sample routes and conditions</div>}
          {content}
          {whyTrip && <Drawer title="Why this changed" onClose={() => setWhyTrip(null)}>
            <div className="why-body">
              <div className="why-copy">{whyText}</div>
              <dl>
                <div><dt>Original modeled exposure</dt><dd>{whyTrip.original.modeledExposure.toFixed(0)}</dd></div>
                <div><dt>Recommended</dt><dd>{whyTrip.recommended.modeledExposure.toFixed(0)}</dd></div>
                <div><dt>Extra travel</dt><dd>{whyTrip.recommended.travelMinutes - whyTrip.original.travelMinutes >= 0 ? '+' : ''}{whyTrip.recommended.travelMinutes - whyTrip.original.travelMinutes} min</dd></div>
              </dl>
            </div>
          </Drawer>}
        </section>
        <aside className="global-map-col" aria-label="Live route overview">
          <div className="compact-map-card">
            <div className="compact-map-head"><div><span className="welcome-kicker">YOUR ROUTE</span><h2>Live map</h2></div><div className="compact-map-head-actions"><span className="location-indicator">{liveLocation ? 'Location detected' : 'Enable location for live position'}</span><button type="button" className="compact-map-expand" title="Expand map to full page" aria-label="Expand map to full page" onClick={() => onNav('map')}><Maximize2 size={16}/></button></div></div>
            <div className="compact-map-frame" title="Click map to open full-page view" onClick={(event) => {
              if (!(event.target as HTMLElement).closest('button, a')) onNav('map');
            }}><ErrorBoundary label="Live map" compact><Map trips={analysis?.trips ?? EMPTY_TRIPS} liveLocation={liveLocation} isDemo={isDemo} previewPoints={previewPoints} /></ErrorBoundary></div>
            <p className="compact-map-note">{analysis?.trips.length ? `${analysis.trips.length} journey${analysis.trips.length === 1 ? '' : 's'} mapped · Click stops for details` : previewPoints.length > 1 ? `${previewPoints.length - 1} stop(s) placed · Dashed straight-line preview; Analyze for actual roads.` : 'Your live position appears here. Add stops and analyze to plot your day.'}</p>
          </div>
          {tab === 'today' && (step === 'manual' || step === 'import') && (
            <div className="planner-map-review">
              <button type="button" className="primary planner-map-review-button"
                onClick={continueToTravel} disabled={busy || !canReviewAgenda(agenda)}>
                Review journeys <span aria-hidden="true">→</span>
              </button>
              <p>{agenda.events.length === 0
                ? 'Add your first stop on the left to continue.'
                : canReviewAgenda(agenda)
                  ? `${agenda.events.length} scheduled stop${agenda.events.length === 1 ? '' : 's'} ready to review.`
                  : 'Complete stop names, destinations and appointment times to continue.'}</p>
            </div>
          )}
        </aside>
      </main>
      )}
      <BottomNav active={tab} onChange={onNav}/>
    </div>
  );
}
