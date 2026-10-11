import { Check, LoaderCircle, Compass, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';

export function AnalysisScreen({ error, onBack }: { error?: string; onBack: () => void }) {
  const steps = [
    'Agenda received & appointment boundaries locked',
    'Journey origin-destination pairs validated',
    'Amazon Location live traffic route alternatives requested',
    'Tomorrow.io & CPCB particulate timelines interpolated',
    'Multi-objective extra-travel constraints applied',
  ];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setCurrentStep((s) => Math.min(s + 1, steps.length));
    }, 1100);
    return () => clearInterval(interval);
  }, [error, steps.length]);

  return (
    <div className="screen narrow analysis-screen" style={{ textAlign: 'center', paddingTop: '10vh' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
        <Compass size={44} className="gold-accent" />
      </div>

      <p className="eyebrow">AWS SERVERLESS OPTIMIZATION ENGINE</p>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '32px', margin: '8px 0 12px' }}>
        Synthesizing Optimal Pathways
      </h1>
      <p style={{ color: 'var(--ivory-muted)', fontSize: '14px', maxWidth: '520px', margin: '0 auto 28px' }}>
        Evaluating route alternatives across Amazon Location Services, traffic telemetry, and
        particulate dispersion matrices.
      </p>

      {!error ? (
        <div className="progress-card renaissance-card" style={{ maxWidth: '560px', margin: '0 auto 24px', textAlign: 'left' }}>
          {steps.map((step, index) =>
            index < currentStep ? (
              <div
                className="progress-row"
                key={step}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--line-subtle)', color: 'var(--green-bright)', fontSize: '13px' }}
              >
                <Check size={18} />
                <span>{step}</span>
              </div>
            ) : null,
          )}
          {currentStep < steps.length && !error ? (
            <div
              className="progress-row active"
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', color: 'var(--gold-bright)', fontSize: '13px', fontWeight: 600 }}
            >
              <LoaderCircle className="spin" size={18} />
              <span>{steps[currentStep]}…</span>
            </div>
          ) : null}
          {currentStep >= steps.length && !error ? (
            <div
              className="progress-row active"
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', color: 'var(--gold-bright)', fontSize: '13px', fontWeight: 600 }}
            >
              <LoaderCircle className="spin" size={18} />
              <span>Finalizing whole-day Pareto frontier…</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="error-banner renaissance-error-banner" style={{ maxWidth: '560px', margin: '0 auto 24px', textAlign: 'left' }}>
          <AlertTriangle size={20} />
          <div>
            <strong>Analysis Interrupted</strong>
            <p style={{ margin: '4px 0 12px', fontSize: '13px' }}>{error}</p>
            <button className="secondary renaissance-btn-secondary" onClick={onBack}>
              <ArrowLeft size={14} />
              <span>Return to Travel Parameters</span>
            </button>
          </div>
        </div>
      )}

      <p className="fine-print" style={{ color: 'var(--sage)' }}>
        Processed on AWS Lambda & Step Functions with Amazon Bedrock reasoning integration.
      </p>
    </div>
  );
}
