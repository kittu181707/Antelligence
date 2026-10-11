import { useEffect, useState } from 'react';
import { CheckCircle2, CloudSun, Leaf, Route } from 'lucide-react';

// AWS returns one final response, not per-stage progress events.
// Intermediate ticks are visual transitions, not verified server work.
const stages = [
  { name: 'Understanding your schedule', detail: 'Keeping appointments and travel preferences together' },
  { name: 'Exploring travel routes', detail: 'Looking for viable routes for your journeys' },
  { name: 'Checking outdoor conditions', detail: 'Comparing modeled air quality and weather along the way' },
  { name: 'Finding the better day', detail: 'Considering exposure, travel time, and your commitments' },
] as const;

export const ANALYSIS_STEP_MS = 950;
const VISUAL_TICK_MS = 270;
export const ANALYSIS_COMPLETED_HOLD_MS = 450;
export const ANALYSIS_MIN_DISPLAY_MS = stages.length * ANALYSIS_STEP_MS + ANALYSIS_COMPLETED_HOLD_MS;

export function AnalysisScreen({ completed = false }: { completed?: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const interval = window.setInterval(() => setElapsedMs(performance.now() - started), 70);
    return () => window.clearInterval(interval);
  }, []);

  const current = Math.min(Math.floor(elapsedMs / ANALYSIS_STEP_MS), stages.length - 1);
  const finalStage = current === stages.length - 1;
  const checked = finalStage
    ? completed
    : elapsedMs % ANALYSIS_STEP_MS >= ANALYSIS_STEP_MS - VISUAL_TICK_MS;
  const stage = stages[current];

  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true"
      aria-labelledby="analysis-overlay-title" aria-describedby="analysis-overlay-desc" data-analysis-overlay>
      <div className="analysis-overlay-content">
        <h2 id="analysis-overlay-title" className="analysis-visually-hidden">Analyzing and optimizing your day</h2>
        <div className="analysis-orbit" aria-hidden="true">
          <span className="analysis-orbit-circle orbit-one">
            <span className="analysis-orbit-object"><Route size={16} strokeWidth={1.9}/></span>
          </span>
          <span className="analysis-orbit-circle orbit-two">
            <span className="analysis-orbit-object"><CloudSun size={16} strokeWidth={1.9}/></span>
          </span>
          <span className="analysis-orbit-circle orbit-three">
            <span className="analysis-orbit-object"><Leaf size={16} strokeWidth={1.9}/></span>
          </span>
          <Leaf className="analysis-orbit-leaf" size={66} strokeWidth={1.6}/>
        </div>
        <div className={checked ? 'analysis-single-step complete' : 'analysis-single-step'}
          data-analysis-step data-stage-index={current} aria-live="polite" aria-atomic="true">
          <span className="analysis-single-step-indicator" aria-hidden="true">
            {checked ? <CheckCircle2 size={25} data-analysis-tick/> : <span className="analysis-step-spinner"/>}
          </span>
          <div key={current + (checked ? '-done' : '-active')} className="analysis-single-step-copy">
            <strong>{stage.name}</strong>
            <span>{checked
              ? finalStage ? 'Your route analysis is ready' : 'Visual step complete'
              : stage.detail}</span>
          </div>
        </div>
        <p id="analysis-overlay-desc" className="analysis-overlay-note">
          Progress animation is illustrative; results appear when the service responds.
        </p>
      </div>
    </div>
  );
}
