import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, CloudSun, Leaf, MapPinned, Route, Sparkles } from 'lucide-react';

// These are illustrative *activity* stages: AWS returns a single result, not
// progress events. Never represent elapsed-time animations as server-confirmed
// completion or percentage progress.
const stages = [
  { name: 'Understanding your schedule', detail: 'Keeping appointments and travel preferences together', icon: MapPinned },
  { name: 'Exploring travel routes', detail: 'Requesting viable routes for your journeys', icon: Route },
  { name: 'Checking outdoor conditions', detail: 'Comparing modeled air quality and weather along the way', icon: CloudSun },
  { name: 'Finding the better day', detail: 'Considering exposure, travel time, and your commitments', icon: Leaf },
] as const;

export function AnalysisScreen() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((tick) => tick + 1), 650);
    return () => window.clearInterval(interval);
  }, []);

  const current = Math.min(elapsed, stages.length - 1);
  const stage = stages[current];
  const ActiveIcon = stage.icon;

  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true" aria-labelledby="analysis-overlay-title" aria-describedby="analysis-overlay-desc" data-analysis-overlay>
      <div className="analysis-overlay-card">
        <div className="analysis-overlay-eyebrow"><span className="analysis-overlay-live-dot"/> ENVIRONMENTAL ROUTE ANALYSIS <Sparkles size={15} aria-hidden="true"/></div>
        <div className="analysis-orbit" aria-hidden="true">
          <span className="analysis-orbit-circle orbit-one"/>
          <span className="analysis-orbit-circle orbit-two"/>
          <span className="analysis-orbit-satellite satellite-one"><Route size={17}/></span>
          <span className="analysis-orbit-satellite satellite-two"><CloudSun size={17}/></span>
          <span className="analysis-orbit-satellite satellite-three"><Leaf size={17}/></span>
          <span className="analysis-orbit-center"><ActiveIcon size={40} strokeWidth={1.9}/></span>
        </div>
        <h2 id="analysis-overlay-title">Designing a better route for your day</h2>
        <p id="analysis-overlay-desc">Your schedule stays in place while we compare route and environmental estimates.</p>
        <div className="analysis-active-step" aria-live="polite" aria-atomic="true">
          <Activity size={17} aria-hidden="true"/>
          <div>
            <strong>{stage.name}</strong>
            <span>{stage.detail}</span>
          </div>
          <span className="analysis-ellipsis" aria-hidden="true"><i/><i/><i/></span>
        </div>
        <div className="analysis-stage-list" aria-label="Illustrative analysis stages">
          {stages.map((item, index) => {
            const Icon = item.icon;
            return <div key={item.name} className={index === current ? 'analysis-stage active' : index < current ? 'analysis-stage visited' : 'analysis-stage'}>
              <span className="analysis-stage-icon"><Icon size={16} aria-hidden="true"/></span>
              <span>{item.name}</span>
              {index === current && <span className="analysis-stage-working">Exploring…</span>}
              {index < current && <CheckCircle2 size={15} className="analysis-stage-check" aria-label="Stage previewed"/>}
            </div>;
          })}
        </div>
        <p className="analysis-overlay-footer">{elapsed >= 20
          ? 'Still working with live services. Your itinerary is safely preserved.'
          : 'Progress animation is illustrative; results appear when the service responds.'}</p>
      </div>
    </div>
  );
}
