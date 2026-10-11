import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Leaf, ShieldCheck } from 'lucide-react';
import { api } from './api';
import { BottomNav, type NavTab } from './components/BottomNav';
import { Drawer } from './components/Drawer';
import { AcceptedScreen } from './screens/AcceptedScreen';
import { AnalysisScreen, ANALYSIS_COMPLETED_HOLD_MS, ANALYSIS_MIN_DISPLAY_MS } from './screens/AnalysisScreen';
import { ChangesScreen } from './screens/ChangesScreen';
import { FinalPlanScreen } from './screens/FinalPlanScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ImportScreen, canReviewAgenda } from './screens/ImportScreen';
import { LandingScreen } from './screens/LandingScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ImpactScreen } from './screens/ImpactScreen';
import { IndiaScreen } from './screens/IndiaScreen';
import { TodayScreen } from './screens/TodayScreen';
import { Map } from './components/Map';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LiveEnvironmentSnapshot } from './components/LiveEnvironmentSnapshot';
import type { AcceptedPlan, AgendaPayload, DayAnalysis, JourneyInput, TripAnalysis, Coordinates } from './types';
import { deriveJourneys, editableJourneys, getUserId, localDate, lastForecastDate, readStoredNumber, storeNumber } from './utils';

const blankAgenda = (location?: Coordinates | null): AgendaPayload => ({ date: localDate(), homeLocation: location ? `${location.lat.toFixed(6)}, ${location.lon.toFixed(6)}` : 'Home', events: [] });
type Step = 'landing'|'import'|'manual'|'overview'|'changes'|'final'|'accepted';
type AgendaMode = 'import' | 'manual';
const EMPTY_TRIPS: TripAnalysis[] = [];
const NAV_TABS: NavTab[] = ['today', 'map', 'optimize', 'impact', 'india', 'history', 'settings'];
const STEPS: Step[] = ['landing', 'import', 'manual', 'overview', 'changes', 'final', 'accepted'];
type BrowserView = { tab: NavTab; step: Step };
const DEFAULT_VIEW: BrowserView = { tab: 'today', step: 'landing' };
const HISTORY_KEY = 'pollutionView';

function viewHash(view: BrowserView): string {
  return '#/' + view.tab + '/' + view.step;
}

function hashBrowserView(): BrowserView | null {
  if (typeof window === 'undefined') return null;
  const parts = window.location.hash.match(/^#\/([^/]+)\/([^/]+)$/);
  if (!parts) return null;
  const tab = parts[1] as NavTab;
  const step = parts[2] as Step;
  return NAV_TABS.includes(tab) && STEPS.includes(step) ? { tab, step } : null;
}

function browserView(state: unknown): BrowserView | null {
  if (!state || typeof state !== 'object') return null;
  const view = (state as Record<string, unknown>)[HISTORY_KEY];
  if (!view || typeof view !== 'object') return null;
  const { tab, step } = view as Record<string, unknown>;
  return NAV_TABS.includes(tab as NavTab) && STEPS.includes(step as Step)
    ? { tab: tab as NavTab, step: step as Step }
    : null;
}

function initialBrowserView(): BrowserView {
  if (typeof window === 'undefined') return DEFAULT_VIEW;
  const saved = browserView(window.history.state) || hashBrowserView();
  if (!saved) return DEFAULT_VIEW;
  // Full plans are held in session React state, not persisted to history.
  // Never restore a result-only screen with no analysis after a hard reload.
  return { tab: saved.tab, step: ['final', 'accepted', 'changes', 'overview'].includes(saved.step) ? 'landing' : saved.step };
}


export default function App() {
  const [step, setStep] = useState<Step>(() => initialBrowserView().step);
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [error, setError] = useState<string>();
  const [whyTrip, setWhyTrip] = useState<TripAnalysis | null>(null);
  const [whyText, setWhyText] = useState('');
  const [tab, setTab] = useState<NavTab>(() => initialBrowserView().tab);
  const [history, setHistory] = useState<AcceptedPlan[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [liveLocation, setLiveLocation] = useState<Coordinates | null>(null);
  const [userId, setUserId] = useState('');
  const [previewPoints, setPreviewPoints] = useState<{ id: string; label: string; point: Coordinates }[]>([]);
  const placeCache = useRef(new globalThis.Map<string, Coordinates>());
  const previousIndiaDay = useRef(localDate());
  const dashboardMainRef = useRef<HTMLElement | null>(null);
  const dashboardPanelRef = useRef<HTMLElement | null>(null);
  const mapPointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const mapWasDragged = useRef(false);

  const plannedJourneys = useMemo(() => editableJourneys(agenda, journeys), [agenda, journeys]);

  // Browser back/forward must restore the currently visible UI (including an
  // unfinished planner) instead of leaving the app stuck on the same tab.
  // No user itinerary, private data or API responses are stored in history.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const next = browserView(event.state) || hashBrowserView() || DEFAULT_VIEW;
      setTab(next.tab);
      setStep((previous) =>
        ['final', 'accepted', 'changes', 'overview'].includes(next.step) && !analysis ? 'landing' : next.step);
      setWhyTrip(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [analysis]);

  // Seed the first entry once. Never write history in response to popstate:
  // an automatic push there would erase the user's Forward stack.
  useLayoutEffect(() => {
    const current = browserView(window.history.state);
    if (current?.tab === tab && current.step === step && window.location.hash === viewHash(current)) return;
    const state = window.history.state && typeof window.history.state === 'object'
      ? window.history.state : {};
    // Distinct same-document URLs prevent Chrome from collapsing or skipping
    // otherwise identical path entries while preserving normal SPA navigation.
    const view = current || { tab, step };
    window.history.replaceState({ ...state, [HISTORY_KEY]: view },
      '', window.location.pathname + window.location.search + viewHash(view));
  }, []);

  const navigate = (nextTab: NavTab, nextStep: Step) => {
    const current = browserView(window.history.state);
    if (current?.tab !== nextTab || current.step !== nextStep) {
      const state = window.history.state && typeof window.history.state === 'object'
        ? window.history.state : {};
      window.history.pushState({ ...state, [HISTORY_KEY]: { tab: nextTab, step: nextStep } },
        '', window.location.pathname + window.location.search + viewHash({ tab: nextTab, step: nextStep }));
    }
    setTab(nextTab);
    setStep(nextStep);
  };

  const mapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    mapWasDragged.current = false;
    mapPointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  };
  const mapPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = mapPointerStart.current;
    if (origin && origin.id === event.pointerId &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 7) {
      mapWasDragged.current = true;
    }
  };
  const mapPointerUp = () => { mapPointerStart.current = null; };


  // The planner and results reuse the same column. Reset both scrollports as
  // soon as a new analyzed Today view appears, before it becomes visible.
  // Deliberate scrolling after entry remains completely under user control.
  useLayoutEffect(() => {
    if (tab === 'today' && step === 'landing' && analysis) {
      if (dashboardMainRef.current) dashboardMainRef.current.scrollTop = 0;
      if (dashboardPanelRef.current) dashboardPanelRef.current.scrollTop = 0;
    }
  }, [analysis?.planId, step, tab]);

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
    if (isDemo || analysis || (tab !== 'today' && tab !== 'map') || (step !== 'manual' && step !== 'import')) {
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
    setWhyText(''); setWhyTrip(null);
    setAgenda(blankAgenda(liveLocation));
    setJourneys([]);
    setAnalysis(null);
    setPreviewPoints([]);
    setAgendaMode(mode);
    navigate('today', mode);
    setError(undefined);
  };

  const loadDemo = async () => {
    if (busy) return;
    setWhyText(''); setWhyTrip(null);
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
      navigate('today', 'landing');
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

  const runAnalysis = async () => {
    if (busy) return;
    if (!isDemo && (agenda.date < localDate() || agenda.date > lastForecastDate())) {
      setStep(agendaMode);
      setError('Choose a day within the next seven days in India before analyzing your route.');
      return;
    }
    if (!canReviewAgenda(agenda)) {
      setStep(agendaMode);
      setError('Complete your starting location, stop names, destinations and non-overlapping times before analyzing.');
      return;
    }
    if (!plannedJourneys.length) {
      setStep(agendaMode);
      setError('Add a valid destination to continue.');
      return;
    }
    if (!userId) { setError('Private session is initializing. Please retry.'); return; }
    setWhyText(''); setWhyTrip(null);
    setError(undefined); setBusy(true); setAnalysisComplete(false); setIsAnalyzing(true);
    const startedAt = Date.now();
    try {
      const result = await api.analyzeDay({ ...agenda, userId, journeys: plannedJourneys, maxExtraMinutes: maxExtra, demoMode: isDemo });
      // Intermediate ticks are illustrative. The last tick is shown only
      // after the API succeeds, before the result page replaces this overlay.
      setAnalysisComplete(true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(
        ANALYSIS_COMPLETED_HOLD_MS, ANALYSIS_MIN_DISPLAY_MS - (Date.now() - startedAt),
      )));
      setAnalysis(result);
      setJourneys(plannedJourneys);
      navigate('today', 'landing'); // Render dashboard
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setStep(agendaMode);
    } finally {
      setIsAnalyzing(false);
      setAnalysisComplete(false);
      setBusy(false);
    }
  };

  const acceptPlan = async () => {
    if (!analysis || busy) return;
    if (!userId) { setError('Private session unavailable.'); return; }
    setBusy(true); setError(undefined);
    try {
      const saved = await api.acceptPlan(userId, analysis.planId);
      setAccepted(saved); navigate('today', 'accepted');
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
    // Preserve an unfinished itinerary while visiting Map or Settings.
    let nextStep = step;
    if (next === 'today' && step !== 'manual' && step !== 'import') nextStep = 'landing';
    if (next === 'optimize') {
      if (analysis) nextStep = 'final';
      else if (agenda.events.length) nextStep = agendaMode;
      else {
        setAgenda(blankAgenda(liveLocation));
        setAgendaMode('manual');
        nextStep = 'manual';
      }
    }
    navigate(next, nextStep);
  };


  let content;
  if (tab === 'history') content = <HistoryScreen plans={history} loading={historyLoading} onRefresh={refreshHistory}/>;
  else if (tab === 'settings') content = <SettingsScreen maxExtra={maxExtra} setMaxExtra={setMaxExtra}/>;
  else if (tab === 'impact') content = <ImpactScreen />;
  else if (tab === 'india') content = <IndiaScreen />;
  else if (step === 'landing') {
    content = <TodayScreen agenda={agenda} journeys={journeys} analysis={analysis} whyText={whyText} whyTrip={whyTrip} onWhy={openWhy} busy={busy} isDemo={isDemo} liveLocation={liveLocation} onImport={() => startAgenda('import')} onManual={() => startAgenda('manual')} onDemo={loadDemo} onAnalyze={runAnalysis} error={error} />;
  }
  else if (step === 'import' || step === 'manual') content = <ImportScreen agenda={agenda} setAgenda={setAgenda} mode={step} journeys={plannedJourneys} setJourneys={setJourneys} maxExtra={maxExtra} setMaxExtra={setMaxExtra} onBack={() => navigate('today', 'landing')} onAnalyze={runAnalysis} onIcs={importIcs} busy={busy} error={error} liveLocation={liveLocation}/>;
  else if (step === 'overview' && analysis) content = <OverviewScreen analysis={analysis} onChanges={() => navigate('today', 'changes')} onKeep={() => { setAnalysis(null); navigate('today', 'landing'); }}/>;
  else if (step === 'changes' && analysis) content = <ChangesScreen analysis={analysis} onBack={() => navigate('today', 'overview')} onWhy={openWhy} onFinal={() => navigate('today', 'final')}/>;
  else if (step === 'final' && analysis) content = <FinalPlanScreen analysis={analysis} onBack={() => navigate('today', 'changes')} onAccept={acceptPlan} busy={busy}/>;
  else if (step === 'accepted' && accepted) content = <AcceptedScreen plan={accepted} onDone={() => navigate('today', 'landing')}/>;
  else content = <TodayScreen agenda={agenda} journeys={journeys} analysis={analysis} whyText={whyText} whyTrip={whyTrip} onWhy={openWhy} busy={busy} isDemo={isDemo} liveLocation={liveLocation} onImport={() => startAgenda('import')} onManual={() => startAgenda('manual')} onDemo={loadDemo} onAnalyze={runAnalysis} error={error} />;

  return (
    <div className="app-container">
      <header className="app-topbar">
        <div className="app-welcome">
          <div className="ant-brand">
            <img className="ant-brand-emblem" src="/antelligence-emblem.svg"
              alt="" aria-hidden="true" width={188} height={160} />
            <div className="ant-brand-copy">
              <h1 className="ant-brand-image-title" aria-label="Antelligence">
                <span className="ant-brand-wordmark" aria-hidden="true">ntelligence</span>
              </h1>
              <p>Intelligence through coordination</p>
            </div>
          </div>
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
              <h2>{isDemo ? 'Demo route map' : 'AWS route view'}</h2>
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
      <main ref={dashboardMainRef} className={`main-content global-split-layout ${tab === 'today' && (step === 'manual' || step === 'import') ? 'planner-layout' : tab === 'today' && step === 'landing' && analysis ? 'results-layout' : tab === 'today' && step === 'landing' && !agenda.events.length ? 'landing-layout' : ''}`}>
        <section ref={dashboardPanelRef} className="global-panel-col">
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
        <aside className="global-map-col" aria-label="AWS route overview">
          <div className="compact-map-card">
            <div className="compact-map-head"><div><span className="welcome-kicker">YOUR ROUTE</span><h2>{isDemo ? 'Demo map' : 'AWS routes'}</h2></div><div className="compact-map-head-actions"><span className="location-indicator">{liveLocation ? 'Location detected' : 'Enable location for live position'}</span><button type="button" className="compact-map-expand" title="Expand map to full page" aria-label="Expand map to full page" onClick={() => onNav('map')}><Maximize2 size={16}/></button></div></div>
            <div className="compact-map-frame" title="Click map to open full-page view"
              onPointerDownCapture={mapPointerDown}
              onPointerMoveCapture={mapPointerMove}
              onPointerUpCapture={mapPointerUp}
              onPointerCancelCapture={() => { mapPointerStart.current = null; mapWasDragged.current = true; }}
              onClick={(event) => {
                // A drag generates a synthetic click after releasing pointer
                // capture. That click MUST NOT expand the map.
                if (mapWasDragged.current) { mapWasDragged.current = false; return; }
                const target = event.target as HTMLElement;
                if (target.closest('button, a') || !target.closest('.raster-map-viewport')) return;
                onNav('map');
              }}><ErrorBoundary label="Live map" compact><Map trips={analysis?.trips ?? EMPTY_TRIPS} liveLocation={liveLocation} isDemo={isDemo} previewPoints={previewPoints} /></ErrorBoundary></div>
            <p className="compact-map-note">{analysis?.trips.length ? `${analysis.trips.length} journey${analysis.trips.length === 1 ? '' : 's'} mapped · Click stops for details` : previewPoints.length > 1 ? `${previewPoints.length - 1} stop(s) placed · Dashed straight-line preview; Analyze for actual roads.` : 'Your live position appears here. Add stops and analyze to plot your day.'}</p>
          </div>
          {tab === 'today' && step === 'landing' && analysis && (
            <section className="results-impact-panel" aria-label="Today's estimated impact">
              <div className="results-impact-heading">
                <span className="results-impact-icon"><Leaf size={19} aria-hidden="true"/></span>
                <div>
                  <span className="results-impact-eyebrow">TODAY'S ESTIMATED IMPACT</span>
                  <h3>{analysis.metrics.exposureReductionPct > 0 ? 'A lighter journey' : 'A well-planned day'}</h3>
                </div>
                <ShieldCheck size={20} className="results-impact-shield" aria-hidden="true"/>
              </div>
              <div className="results-impact-stats">
                <div>
                  <span>Modeled exposure reduction</span>
                  <strong>{analysis.metrics.exposureReductionPct}%</strong>
                </div>
                <div>
                  <span>Estimated CO₂e saved</span>
                  <strong>{Math.max(0, -(analysis.metrics.estimatedCo2eChangeKg || 0)).toFixed(1)} <small>kg</small></strong>
                </div>
              </div>
              <p>Environmental impact is modeled, not a measurement of personal exposure.</p>
            </section>
          )}
          {tab === 'today' && (step === 'manual' || step === 'import') && (
            <div className="planner-map-review">
              <button type="button" className="primary planner-map-review-button"
                onClick={runAnalysis} disabled={busy || !canReviewAgenda(agenda)}>
                {busy ? 'Analyzing your day…' : 'Analyze & optimize my day'} <span aria-hidden="true">→</span>
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
      {isAnalyzing && <AnalysisScreen completed={analysisComplete}/>}
    </div>
  );
}
