import { ArrowDown, ArrowRight, CalendarCheck, Clock3, Sun, Wind } from 'lucide-react';
import type { DayAnalysis } from '../types';

export function OverviewScreen({ analysis, onChanges, onKeep }: { analysis: DayAnalysis; onChanges: () => void; onKeep: () => void }) {
  const m = analysis.metrics;
  return <div className="screen wide result-screen">
    <div className="screen-title"><p className="eyebrow">YOUR DAY</p><h1>A lower-exposure day</h1><p>Every fixed appointment remains where it was.</p></div>
    <section className="exposure-hero"><div><span>Original</span><strong>{m.originalExposureIndex}</strong></div><ArrowRight/><div className="optimized"><span>Optimized</span><strong>{m.optimizedExposureIndex}</strong></div><div className="delta"><ArrowDown/> {m.exposureReductionPct}% <small>modeled exposure</small></div></section>
    <div className="metric-grid">
      <div><CalendarCheck/><span>Appointments changed</span><strong>{m.appointmentsChanged}</strong></div>
      <div><Clock3/><span>Extra travel</span><strong>+{m.extraTravelMinutes} min</strong></div>
      <div><Sun/><span>High-UV outdoor time</span><strong>{m.originalHighUvMinutes ? `-${Math.max(0, Math.round((1 - m.optimizedHighUvMinutes / m.originalHighUvMinutes) * 100))}%` : '0 min'}</strong></div>
      <div><Wind/><span>Modeled exposure</span><strong>-{m.exposureReductionPct}%</strong></div>
    </div>
    <section className="aws-proof"><div><p className="eyebrow">AWS STEP FUNCTIONS</p><h3>Whole-day search completed</h3></div><dl><div><dt>Routes evaluated</dt><dd>{analysis.workflow.routesEvaluated}</dd></div><div><dt>Day plans tested</dt><dd>{analysis.workflow.dayPlansTested}</dd></div><div><dt>Feasible plans</dt><dd>{analysis.workflow.feasiblePlans}</dd></div></dl></section>
    <div className="result-actions"><button className="primary" onClick={onChanges}>See what changed</button><button className="secondary" onClick={onKeep}>Keep original day</button></div>
  </div>;
}
