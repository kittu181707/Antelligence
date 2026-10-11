import { PRODUCT_NAME } from '../config';

export function Brand() {
  return (
    <div className="brand" aria-label="Product name">
      <span className="brand-crest">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="10" stroke="var(--gold)" strokeDasharray="3 2" />
          <circle cx="12" cy="12" r="5" stroke="var(--green)" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="var(--gold)" strokeLinecap="round" />
        </svg>
      </span>
      <div className="brand-text-col">
        <span className="brand-title">{PRODUCT_NAME}</span>
        <span className="brand-sub">RENAISSANCE ENVIRONMENTAL INTELLIGENCE</span>
      </div>
    </div>
  );
}
