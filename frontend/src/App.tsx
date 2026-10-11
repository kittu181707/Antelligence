import { useEffect, useState } from 'react';
import { api } from './api';
import { BottomNav, type NavTab } from './components/BottomNav';
import { RenaissanceHeader } from './components/RenaissanceHeader';
import { Drawer } from './components/Drawer';
import { AcceptedScreen } from './screens/AcceptedScreen';
import { AnalysisScreen } from './screens/AnalysisScreen';
import { ChangesScreen } from './screens/ChangesScreen';
import { FinalPlanScreen } from './screens/FinalPlanScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ImportScreen } from './screens/ImportScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TravelScreen } from './screens/TravelScreen';
import { ImpactScreen } from './screens/ImpactScreen';
import { IndiaScreen } from './screens/IndiaScreen';
import { TodayScreen } from './screens/TodayScreen';
import { Map } from './components/Map';
import type { AcceptedPlan, AgendaPayload, DayAnalysis, JourneyInput, TripAnalysis, Coordinates } from './types';
import { deriveJourneys, getUserId, localDate, readStoredNumber, storeNumber } from './utils';

const blankAgenda = (): AgendaPayload => ({ date: localDate(), homeLocation: 'Guntur', events: [] });
type Step = 'landing'|'import'|'manual'|'travel'|'analysis'|'overview'|'changes'|'final'|'accepted';
type AgendaMode = 'import' | 'manual';

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

  useEffect(() => {
    let active = true;
    let watchId: number;

    void getUserId().then((value) => { if (active) setUserId(value); }).catch(() => {
      if (active) setError('Private session could not initialize. A secure browser connection is required.');
    });

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => { if (active) setLiveLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
        () => { if (active) setLiveLocation(null); },
        { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 10000 }
      );
    }

    return () => { 
      active = false; 
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const setMaxExtra = (value: number) => { 
    setMaxExtraState(value); 
    storeNumber('max_extra_minutes', value); 
  };

  const startAgenda = (mode: AgendaMode) => {
    setIsDemo(false);
    setAgenda(blankAgenda());
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
      setIsDemo(true); 
      setAgenda(demo); 
      setJourneys(demoJourneys); 
      setAgendaMode('manual');
      
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
      setAgenda({ ...parsed, homeLocation: agenda.homeLocation || 'Guntur' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse calendar');
    } finally {
      setBusy(false);
    }
  };

  const continueToTravel = () => {
    const newJourneys = deriveJourneys(agenda.events, agenda.homeLocation);
    if (journeys.length === newJourneys.length && journeys.every((j, i) => j.origin === newJourneys[i].origin && j.destination === newJourneys[i].destination)) {
      // Structure matches, retain customizations
    } else {
      setJourneys(newJourneys);
    }
    setStep('travel');
    setError(undefined);
  };

  const runAnalysis = async () => {
    if (busy) return;
    if (!userId) { setError('Private session is initializing. Please retry.'); return; }
    setStep('analysis'); setError(undefined); setBusy(true);
    try {
      const result = await api.analyzeDay({ ...agenda, userId, journeys, maxExtraMinutes: maxExtra, demoMode: isDemo });
      setAnalysis(result); 
      setStep('landing'); // Render dashboard
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
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
    if (next === 'today') setStep('landing');
    if (next === 'optimize') setStep(analysis ? 'final' : journeys.length > 0 ? 'travel' : 'landing');
  };

  if (tab === 'history') {
    return (
      <div className="app-container">
        <RenaissanceHeader activeTab={tab} onTabChange={onNav} onDemo={loadDemo} busy={busy} isDemo={isDemo} />
        <BottomNav active={tab} onChange={onNav} />
        <main className="main-content">
          <HistoryScreen plans={history} loading={historyLoading} onRefresh={refreshHistory} />
        </main>
      </div>
    );
  }

  if (tab === 'settings') {
    return (
      <div className="app-container">
        <RenaissanceHeader activeTab={tab} onTabChange={onNav} onDemo={loadDemo} busy={busy} isDemo={isDemo} />
        <BottomNav active={tab} onChange={onNav} />
        <main className="main-content">
          <SettingsScreen maxExtra={maxExtra} setMaxExtra={setMaxExtra} />
        </main>
      </div>
    );
  }

  if (tab === 'impact') {
    return (
      <div className="app-container">
        <RenaissanceHeader activeTab={tab} onTabChange={onNav} onDemo={loadDemo} busy={busy} isDemo={isDemo} />
        <BottomNav active={tab} onChange={onNav} />
        <main className="main-content">
          <ImpactScreen />
        </main>
      </div>
    );
  }

  if (tab === 'india') {
    return (
      <div className="app-container">
        <RenaissanceHeader activeTab={tab} onTabChange={onNav} onDemo={loadDemo} busy={busy} isDemo={isDemo} />
        <BottomNav active={tab} onChange={onNav} />
        <main className="main-content">
          <IndiaScreen />
        </main>
      </div>
    );
  }

  let content;
  if (step === 'landing') {
    content = (
      <TodayScreen 
        agenda={agenda} 
        journeys={journeys} 
        analysis={analysis} 
        whyText={whyText} 
        whyTrip={whyTrip} 
        onWhy={openWhy} 
        busy={busy} 
        isDemo={isDemo} 
        liveLocation={liveLocation} 
        onImport={() => startAgenda('import')} 
        onManual={() => startAgenda('manual')} 
        onDemo={loadDemo} 
        onAnalyze={runAnalysis} 
        error={error} 
        mapComponent={<Map trips={analysis?.trips || []} isDemo={isDemo} />}
        onChanges={() => setStep('changes')}
        onFinal={() => setStep('final')}
        onAccept={acceptPlan}
        onNavigateTab={(t) => onNav(t as NavTab)}
        userId={userId}
        history={history}
        onLocationChange={(loc) => setAgenda(prev => ({ ...prev, homeLocation: loc }))}
      />
    );
  }
  else if (step === 'import' || step === 'manual') {
    content = <ImportScreen agenda={agenda} setAgenda={setAgenda} mode={step} onBack={() => setStep('landing')} onContinue={continueToTravel} onIcs={importIcs} busy={busy} error={error} />;
  }
  else if (step === 'travel') content = <TravelScreen journeys={journeys} setJourneys={setJourneys} maxExtra={maxExtra} setMaxExtra={setMaxExtra} onBack={() => setStep(agendaMode)} onAnalyze={runAnalysis} isDemo={isDemo} />;
  else if (step === 'analysis') {
    content = <AnalysisScreen error={error} onBack={() => setStep('travel')} />;
  }
  else if (step === 'overview' && analysis) {
    content = <OverviewScreen analysis={analysis} onChanges={() => setStep('changes')} onKeep={() => { setAnalysis(null); setStep('landing'); }} />;
  }
  else if (step === 'changes' && analysis) {
    content = <ChangesScreen analysis={analysis} onBack={() => setStep(step === 'changes' ? 'landing' : 'overview')} onWhy={openWhy} onFinal={() => setStep('final')} />;
  }
  else if (step === 'final' && analysis) {
    content = <FinalPlanScreen analysis={analysis} onBack={() => setStep('changes')} onAccept={acceptPlan} busy={busy} />;
  }
  else if (step === 'accepted' && accepted) {
    content = <AcceptedScreen plan={accepted} onDone={() => { setTab('today'); setStep('landing'); }} />;
  }
  else {
    content = (
      <TodayScreen 
        agenda={agenda} 
        journeys={journeys} 
        analysis={analysis} 
        whyText={whyText} 
        whyTrip={whyTrip} 
        onWhy={openWhy} 
        busy={busy} 
        isDemo={isDemo} 
        liveLocation={liveLocation} 
        onImport={() => startAgenda('import')} 
        onManual={() => startAgenda('manual')} 
        onDemo={loadDemo} 
        onAnalyze={runAnalysis} 
        error={error} 
        mapComponent={<Map trips={analysis?.trips || []} isDemo={isDemo} />}
        onChanges={() => setStep('changes')}
        onFinal={() => setStep('final')}
        onAccept={acceptPlan}
        onNavigateTab={(t) => onNav(t as NavTab)}
        userId={userId}
        history={history}
        onLocationChange={(loc) => setAgenda(prev => ({ ...prev, homeLocation: loc }))}
      />
    );
  }

  return (
    <div className="app-container">
      <RenaissanceHeader activeTab={tab} onTabChange={onNav} onDemo={loadDemo} busy={busy} isDemo={isDemo} />
      <BottomNav active={tab} onChange={onNav} />
      <main className="main-content">
        {isDemo && (
          <div className="demo-banner-global">
            <span className="demo-dot" />
            <span>DEMO MODE ACTIVE · GUNTUR ENVIRONMENTAL CORRIDOR</span>
          </div>
        )}
        {content}
        
        {whyTrip && (
          <Drawer title="Why This Route Was Selected" onClose={() => setWhyTrip(null)}>
            <div className="why-body renaissance-why-drawer">
              <div className="drawer-kicker">AMAZON BEDROCK & DETERMINISTIC ANALYSIS</div>
              <div className="why-copy">{whyText}</div>
              <dl className="why-stats-table">
                <div><dt>Original modeled exposure</dt><dd>{whyTrip.original.modeledExposure.toFixed(0)}</dd></div>
                <div><dt>Recommended route exposure</dt><dd>{whyTrip.recommended.modeledExposure.toFixed(0)}</dd></div>
                <div><dt>Transit time delta</dt><dd>{whyTrip.recommended.travelMinutes - whyTrip.original.travelMinutes >= 0 ? '+' : ''}{whyTrip.recommended.travelMinutes - whyTrip.original.travelMinutes} min</dd></div>
                <div><dt>Modeled reduction</dt><dd className="gold-text">{Math.max(0, Math.round((1 - whyTrip.recommended.modeledExposure / Math.max(0.01, whyTrip.original.modeledExposure)) * 100))}% less exposure</dd></div>
              </dl>
              <div className="fine-print">Calculated from verified meteorological and traffic matrices. Not medical advice.</div>
            </div>
          </Drawer>
        )}
      </main>
    </div>
  );
}
