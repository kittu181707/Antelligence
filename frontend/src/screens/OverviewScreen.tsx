import { ArrowDown, ArrowRight, CalendarCheck, Clock3, Sun, Wind, ShieldCheck, Database } from 'lucide-react';
import type { DayAnalysis } from '../types';

export function OverviewScreen({
  analysis,
  onChanges,
  onKeep,
}: {
  analysis: DayAnalysis;
  onChanges: () => void;
  onKeep: () => void;
}) {
  const m = analysis.metrics;

  return (
    <div className="screen wide result-screen">
      <div className="screen-title">
        <p className="eyebrow">ACT IV · OPTIMIZATION OVERVIEW</p>
        <h1>A Lower-Exposure Day</h1>
        <p>
          Every critical appointment and meeting time is maintained. Travel corridors have been
          strategically routed away from peak particulate spikes.
        </p>
      </div>

      <section className="exposure-hero renaissance-exposure-hero" style={{ padding: '24px', marginBottom: '24px' }}>
        <div>
          <span>Baseline Modeled Exposure</span>
          <strong>{m.originalExposureIndex}</strong>
        </div>
        <ArrowRight size={26} className="gold-accent" />
        <div className="optimized">
          <span>Optimized Whole-Day Exposure</span>
          <strong>{m.optimizedExposureIndex}</strong>
        </div>
        <div className="delta">
          <ArrowDown size={16} />
          <span>{m.exposureReductionPct}% less modeled exposure</span>
        </div>
      </section>

      <div className="metric-grid renaissance-metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div>
          <CalendarCheck size={18} className="gold-accent" />
          <span>Appointments Changed</span>
          <strong>{m.appointmentsChanged}</strong>
        </div>
        <div>
          <Clock3 size={18} className="gold-accent" />
          <span>Extra Travel Budget Used</span>
          <strong>+{m.extraTravelMinutes} min</strong>
        </div>
        <div>
          <Sun size={18} className="gold-accent" />
          <span>High-UV Outdoor Exposure</span>
          <strong>
            {m.originalHighUvMinutes
              ? `-${Math.max(0, Math.round((1 - m.optimizedHighUvMinutes / m.originalHighUvMinutes) * 100))}%`
              : '0 min'}
          </strong>
        </div>
        <div>
          <Wind size={18} className="gold-accent" />
          <span>Modeled Dose Reduction</span>
          <strong>-{m.exposureReductionPct}%</strong>
        </div>
      </div>

      <section className="aws-proof renaissance-card" style={{ marginBottom: '28px' }}>
        <div>
          <p className="eyebrow">AWS SERVERLESS ARCHITECTURE VERIFICATION</p>
          <h3 style={{ margin: '4px 0 0', fontFamily: 'var(--font-serif)', fontSize: '18px' }}>
            Multi-Objective Combinatorial Search Complete
          </h3>
        </div>
        <dl style={{ display: 'flex', gap: '28px', margin: 0 }}>
          <div>
            <dt style={{ fontSize: '11px', color: 'var(--ivory-muted)' }}>Routes Evaluated</dt>
            <dd style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gold-bright)', margin: '4px 0 0' }}>
              {analysis.workflow.routesEvaluated}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', color: 'var(--ivory-muted)' }}>Day Plans Tested</dt>
            <dd style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gold-bright)', margin: '4px 0 0' }}>
              {analysis.workflow.dayPlansTested}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: '11px', color: 'var(--ivory-muted)' }}>Feasible Plans</dt>
            <dd style={{ fontSize: '20px', fontWeight: 700, color: 'var(--green-bright)', margin: '4px 0 0' }}>
              {analysis.workflow.feasiblePlans}
            </dd>
          </div>
        </dl>
      </section>

      <div className="result-actions" style={{ display: 'flex', gap: '14px' }}>
        <button className="primary large renaissance-btn-primary" onClick={onChanges}>
          <span>Inspect Focused Changes</span>
          <ArrowRight size={18} />
        </button>
        <button className="secondary large renaissance-btn-secondary" onClick={onKeep}>
          <span>Keep Original Day Plan</span>
        </button>
      </div>
    </div>
  );
}
