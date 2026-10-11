import { History, ShieldCheck, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import type { AcceptedPlan } from '../types';

export function HistoryScreen({ plans, loading, onRefresh }: { plans: AcceptedPlan[]; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="screen wide with-nav">
      <div className="screen-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p className="eyebrow">ARCHIVE · PERSISTED COMMUTES</p>
          <h1>Accepted Journey Plans</h1>
          <p>Historical itineraries accepted and committed to Amazon DynamoDB.</p>
        </div>
        {plans.length > 0 && (
          <button className="secondary renaissance-btn-secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Refreshing…' : 'Refresh Records'}</span>
          </button>
        )}
      </div>

      {!plans.length ? (
        <div className="renaissance-card empty-agenda-renaissance" style={{ marginTop: '24px' }}>
          <div className="empty-ornament">
            <History size={44} className="gold-accent" />
          </div>
          <h3>No Accepted Plans Yet</h3>
          <p>
            When you run the optimizer and select "Accept & Use This Plan", your saved whole-day
            itineraries and modeled outcomes will be cataloged here in your private ledger.
          </p>
          <button className="secondary renaissance-btn-secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Refreshing…' : 'Check for Updates'}</span>
          </button>
        </div>
      ) : (
        <div className="history-grid" style={{ marginTop: '24px' }}>
          {plans.map((plan) => (
            <article className="history-card renaissance-card" key={plan.planId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="plan-date" style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '13px' }}>
                  {plan.date}
                </span>
                <span 
                  style={{ 
                    fontSize: '10px', 
                    letterSpacing: '0.08em', 
                    padding: '2px 8px', 
                    borderRadius: '99px',
                    background: plan.workflow.dataMode === 'demo' ? 'rgba(239,68,68,0.15)' : 'rgba(46,196,125,0.15)',
                    color: plan.workflow.dataMode === 'demo' ? '#ff9999' : 'var(--green-bright)',
                    border: plan.workflow.dataMode === 'demo' ? '1px solid var(--red)' : '1px solid var(--green)'
                  }}
                >
                  {plan.workflow.dataMode === 'demo' ? 'DEMO PLAN' : 'LIVE COMMUTE'}
                </span>
              </div>

              <strong style={{ fontSize: '22px', fontFamily: 'var(--font-serif)', color: 'var(--green-bright)' }}>
                {plan.metrics.exposureReductionPct > 0 ? `-${plan.metrics.exposureReductionPct}%` : '0%'} modeled exposure
              </strong>

              <p style={{ margin: 0, fontSize: '13px', color: 'var(--ivory-muted)' }}>
                {plan.metrics.extraTravelMinutes > 0 ? `+${plan.metrics.extraTravelMinutes}` : '0'} min transit delta • {plan.changes.length} route modification{plan.changes.length === 1 ? '' : 's'}
              </p>

              <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--sage)' }}>
                <span>{plan.trips.length} Total Journeys</span>
                <span style={{ fontFamily: 'monospace' }}>{plan.planId.slice(0, 10)}…</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
