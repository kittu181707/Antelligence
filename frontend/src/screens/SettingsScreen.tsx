import { PRODUCT_NAME } from '../config';

export function SettingsScreen({ maxExtra, setMaxExtra }: { maxExtra: number; setMaxExtra: (v: number) => void }) {
  return <div className="screen narrow with-nav">
    <div className="screen-title">
      <p className="eyebrow">SETTINGS</p><h1>Optimization preferences</h1>
      <p>{PRODUCT_NAME} minimizes modeled environmental exposure while keeping fixed appointments intact.</p>
    </div>
    <section className="preference-card vertical">
      <div>
        <h2>Extra-travel budget</h2>
        <p>The maximum additional travel minutes allowed across your whole day. Setting zero forbids slower alternatives; it does <strong>not</strong> switch the optimizer to a shortest-time algorithm.</p>
      </div>
      <div className="segmented">
        {[0, 5, 10, 15].map((value) => <button key={value}
          type="button" aria-pressed={maxExtra === value} className={maxExtra === value ? 'selected' : ''}
          onClick={() => setMaxExtra(value)}>{value ? '+' + value : '0'} min</button>)}
      </div>
    </section>
    <section className="info-card" style={{ marginTop: 16 }}>
      <strong>What changes when you adjust this?</strong>
      <p>We rerank Amazon Location routes and departure choices within your travel limit. CO₂e is reported separately, not optimized with exposure.</p>
      <p>All results are modeled estimates for decision support, not measurements of your personal dose or proof of improved health.</p>
    </section>
  </div>;
}
