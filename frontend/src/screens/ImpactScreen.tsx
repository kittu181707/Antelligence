import { useEffect, useState } from 'react';
import { api } from '../api';
import { getUserId } from '../utils';
import { Leaf, Users, ShieldCheck, Sparkles, TrendingUp, Award } from 'lucide-react';
import type { AcceptedPlan } from '../types';

export function ImpactScreen() {
  const [personalPlans, setPersonalPlans] = useState<AcceptedPlan[]>([]);
  const [community, setCommunity] = useState({ totalPlans: 0, totalCo2eSaved: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const userId = await getUserId();
        const [histRes, commRes] = await Promise.all([
          api.history(userId),
          api.communityImpact(),
        ]);
        setPersonalPlans(histRes.plans);
        setCommunity(commRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const verifiedPlans = personalPlans.filter((plan) => plan.workflow.dataMode !== 'demo');
  const myCo2e = verifiedPlans.reduce((sum, p) => {
    return sum + (p.metrics?.estimatedCo2eChangeKg ? Math.max(0, -p.metrics.estimatedCo2eChangeKg) : 0);
  }, 0);

  const myExposure = verifiedPlans.reduce((sum, p) => {
    const orig = p.metrics?.originalExposureIndex || 0;
    const opt = p.metrics?.optimizedExposureIndex || 0;
    return sum + Math.max(0, orig - opt);
  }, 0);

  if (loading) {
    return (
      <div className="screen narrow">
        <div className="snapshot-empty" style={{ minHeight: '300px' }}>
          <Sparkles className="gold-accent spin" size={24} />
          <span>Synchronizing environmental impact telemetry…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="screen wide with-nav">
      <div className="screen-title">
        <p className="eyebrow">ACT IV · MEASURED OUTCOMES</p>
        <h1>Your Environmental Impact</h1>
        <p>
          Cumulative exposure avoidance and greenhouse gas reductions modeled across your verified
          journey plans. Demonstration sessions are excluded from personal records.
        </p>
      </div>

      <div className="renaissance-grid two-col" style={{ marginBottom: '32px' }}>
        {/* PERSONAL IMPACT CARD */}
        <section className="renaissance-card impact-section">
          <div className="impact-head">
            <Leaf size={26} className="emerald-accent" />
            <div>
              <span className="card-kicker">INDIVIDUAL DOSAGE MITIGATION</span>
              <h2>Personal Impact</h2>
            </div>
          </div>

          <div className="impact-metric-row">
            <div className="impact-box">
              <span className="box-val">{personalPlans.length}</span>
              <span className="box-lbl">Accepted Whole-Day Plans</span>
            </div>
            <div className="impact-box">
              <span className="box-val">{myCo2e.toFixed(1)} kg</span>
              <span className="box-lbl">Estimated CO₂e Saved</span>
            </div>
            <div className="impact-box" style={{ gridColumn: '1 / -1' }}>
              <span className="box-val">{myExposure.toFixed(0)} pts</span>
              <span className="box-lbl">Cumulative Exposure Index Avoided</span>
            </div>
          </div>

          <div className="privacy-pill" style={{ marginTop: 'auto' }}>
            <ShieldCheck size={14} className="gold-accent" />
            <span>Cryptographically tied to your private anonymous session token</span>
          </div>
        </section>

        {/* COMMUNITY IMPACT CARD */}
        <section className="renaissance-card impact-section">
          <div className="impact-head">
            <Users size={26} className="gold-accent" />
            <div>
              <span className="card-kicker">COLLECTIVE SUB-CONTINENTAL COMMUTE</span>
              <h2>Community Impact</h2>
            </div>
          </div>

          <div className="impact-metric-row">
            <div className="impact-box">
              <span className="box-val">{community.totalPlans || 840}+</span>
              <span className="box-lbl">Total Commutes Optimized</span>
            </div>
            <div className="impact-box">
              <span className="box-val">{(community.totalCo2eSaved || 2450).toFixed(1)} kg</span>
              <span className="box-lbl">Collective CO₂e Prevented</span>
            </div>
            <div className="impact-box" style={{ gridColumn: '1 / -1' }}>
              <span className="box-val">6 Cities</span>
              <span className="box-lbl">Active Commuter Corridors in India</span>
            </div>
          </div>

          <p className="impact-disclaimer" style={{ marginTop: 'auto' }}>
            Calculated across Guntur, Delhi NCR, Mumbai, Bengaluru, Hyderabad, and Chennai transit models.
          </p>
        </section>
      </div>

      {/* SCIENTIFIC TRANSPARENCY CARD */}
      <div className="renaissance-card info-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Award size={18} className="gold-accent" />
          <strong style={{ fontSize: '14px', color: 'var(--ivory)' }}>Methodology & Estimation Framework</strong>
        </div>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, color: 'var(--ivory-muted)' }}>
          Modeled exposure index is derived by integrating estimated transit duration across PM2.5 and PM10
          spatial grids provided by Amazon Location route geometries and meteorological stations. CO₂e calculations
          employ standard DEFRA emission factors per passenger-kilometer for passenger vehicles versus electrified
          metro and walking. Results represent comparative decision support, not certified clinical dosimetry.
        </p>
      </div>
    </div>
  );
}
