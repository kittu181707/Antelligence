import { Check, LoaderCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

export function AnalysisScreen({ error, onBack }: { error?: string; onBack: () => void }) {
  const steps = ['Agenda received', 'Journeys validated', 'Route alternatives requested', 'Pollution + weather timeline checked', 'Constraints applied'];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setCurrentStep(s => Math.min(s + 1, steps.length));
    }, 1200);
    return () => clearInterval(interval);
  }, [error, steps.length]);

  return <div className="screen narrow analysis-screen"><p className="eyebrow">AI OPTIMIZATION</p><h1>Analyzing your day</h1>
    {!error ? <div className="progress-card">
      {steps.map((step, index) => index < currentStep ? <div className="progress-row" key={step}><Check/> <span>{step}</span></div> : null)}
      {currentStep < steps.length && !error ? <div className="progress-row active"><LoaderCircle className="spin"/><strong>{steps[currentStep]}…</strong></div> : null}
      {currentStep >= steps.length && !error ? <div className="progress-row active"><LoaderCircle className="spin"/><strong>Finding the best whole-day plan…</strong></div> : null}
    </div> : <div className="error-banner"><strong>Analysis stopped.</strong><br/>{error}<div><button className="secondary" onClick={onBack}>Return to Plan your day</button></div></div>}
    <p className="fine-print">Processing environmental data and optimizing routes...</p>
  </div>;
}
