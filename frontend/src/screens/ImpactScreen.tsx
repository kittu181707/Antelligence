import { useEffect, useState } from 'react';
import { api } from '../api';
import { getUserId } from '../utils';
import { Leaf, Users } from 'lucide-react';
import type { AcceptedPlan } from '../types';

export function ImpactScreen() {
  const [personalPlans, setPersonalPlans] = useState<AcceptedPlan[]>([]);
  const [community, setCommunity] = useState<{ totalPlans: number; totalCo2eSaved: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const userId = await getUserId();
        const [history, stats] = await Promise.all([api.history(userId), api.communityImpact()]);
        if (!Array.isArray(history.plans) || !Number.isFinite(stats.totalPlans) || !Number.isFinite(stats.totalCo2eSaved)) {
          throw new Error('Incomplete impact data');
        }
        if (!active) return;
        setPersonalPlans(history.plans);
        setCommunity(stats);
      } catch {
        if (active) { setCommunity(null); setError('Impact data is temporarily unavailable; no figures are being estimated or substituted.'); }
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [retry]);

  const realPlans = personalPlans.filter((plan) => plan.workflow?.dataMode === 'live');
  const demonstrationPlans = personalPlans.filter((plan) => plan.workflow?.dataMode === 'demo');
  const co2e = realPlans.reduce((sum, plan) => sum + Math.max(0, -(plan.metrics?.estimatedCo2eChangeKg || 0)), 0);
  const exposure = realPlans.reduce((sum, plan) =>
    sum + Math.max(0, (plan.metrics?.originalExposureIndex || 0) - (plan.metrics?.optimizedExposureIndex || 0)), 0);

  return <div className="screen narrow with-nav">
    <div className="screen-title">
      <p className="eyebrow">YOUR IMPACT</p><h1>Estimated impact</h1>
      <p>Based on accepted plans—not verified trips taken or measured emissions. Controlled demos are excluded from these impact figures.</p>
    </div>
    {loading && <p role="status">Loading accepted-plan records…</p>}
    {error && <div className="error-banner" role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {!loading && !error && community && <>
      <section className="impact-section">
        <h2><Leaf size={20} color="var(--green)"/> Personal plans</h2>
        <div className="metric-grid">
          <div><span>Real plans accepted</span><strong>{realPlans.length}</strong></div>
          <div><span>Estimated CO₂e avoided</span><strong>{co2e.toFixed(1)} kg</strong></div>
          <div><span>Modeled exposure index improvement (sum)</span><strong>{exposure.toFixed(0)}</strong></div>
        </div>
        {demonstrationPlans.length > 0 && <p className="fine-print">{demonstrationPlans.length} saved demo plan(s) omitted from impact.</p>}
        <p className="fine-print">An accepted recommendation is not proof the journey was completed. The exposure index is relative for each day and is not a measured cumulative pollutant dose.</p>
      </section>
      <section className="impact-section" style={{ marginTop: 32 }}>
        <h2><Users size={20} color="var(--green)"/> Community accepted plans</h2>
        <div className="metric-grid">
          <div><span>Real plans accepted</span><strong>{community.totalPlans}</strong></div>
          <div><span>Estimated CO₂e avoided</span><strong>{community.totalCo2eSaved.toFixed(1)} kg</strong></div>
        </div>
        <p className="fine-print">Aggregates reflect accepted real-mode plans stored in DynamoDB—not verified citywide air-quality improvements.</p>
      </section>
    </>}
  </div>;
}
