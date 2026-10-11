import { useState } from 'react';
import { 
  ArrowRight, 
  CalendarPlus, 
  FileUp, 
  Sparkles, 
  Wind, 
  Sun, 
  ShieldCheck, 
  Compass, 
  MapPin, 
  Activity, 
  ChevronDown, 
  Globe2, 
  Layers, 
  Leaf, 
  Users, 
  Clock, 
  Eye
} from 'lucide-react';
import { LiveEnvironmentSnapshot } from './LiveEnvironmentSnapshot';
import type { Coordinates, DayAnalysis } from '../types';

export const SUPPORTED_CITIES = [
  { name: 'Guntur (Demo)', query: 'Guntur', coords: { lat: 16.3067, lon: 80.4365 }, desc: 'Primary demonstration corridor with verified transit network' },
  { name: 'Delhi NCR', query: 'Delhi', coords: { lat: 28.6139, lon: 77.2090 }, desc: 'Northern plains, high winter PM2.5 inversion zone' },
  { name: 'Mumbai', query: 'Mumbai', coords: { lat: 19.0760, lon: 72.8777 }, desc: 'Coastal urban canopy with maritime wind dispersal' },
  { name: 'Bengaluru', query: 'Bengaluru', coords: { lat: 12.9716, lon: 77.5946 }, desc: 'Deccan plateau with elevation-driven microclimates' },
  { name: 'Hyderabad', query: 'Hyderabad', coords: { lat: 17.3850, lon: 78.4867 }, desc: 'Semi-arid tech corridor with traffic congestion hotspots' },
  { name: 'Chennai', query: 'Chennai', coords: { lat: 13.0827, lon: 80.2707 }, desc: 'Coromandel coastal plain with tropical humidity cycles' },
];

interface HeroProps {
  onOptimizeClick: () => void;
  onImportClick: () => void;
  onManualClick: () => void;
  onDemoClick: () => void;
  busy: boolean;
  isDemo: boolean;
  liveLocation?: Coordinates | null;
  selectedCity: string;
  onSelectCity: (city: typeof SUPPORTED_CITIES[0]) => void;
}

export function AtmosphericHero({
  onOptimizeClick,
  onImportClick,
  onManualClick,
  onDemoClick,
  busy,
  isDemo,
  liveLocation,
  selectedCity,
  onSelectCity,
}: HeroProps) {
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  return (
    <section className="renaissance-hero" id="hero-section">
      <div className="hero-kicker-row">
        <span className="scene-roman-badge">PROLOGUE</span>
        <span className="kicker-divider">•</span>
        <span className="hero-eyebrow">CELESTIAL ATMOSPHERE & HUMAN TRANSIT</span>
      </div>

      <div className="hero-title-wrap">
        <h1 className="hero-headline">
          Move Smarter.<br />
          <em>Breathe Better.</em>
        </h1>
        <p className="hero-description">
          A high-precision environmental intelligence engine that harmonizes your daily itinerary
          with real-time atmospheric dynamics—reducing personal pollution exposure by up to 40%
          without altering your appointments.
        </p>
      </div>

      {/* PRIMARY FUNCTIONAL ACTIONS */}
      <div className="hero-cta-cluster">
        <button className="primary renaissance-btn-primary" onClick={onOptimizeClick}>
          <span>Optimize My Day</span>
          <ArrowRight size={18} />
        </button>

        <button 
          className={`secondary renaissance-btn-secondary ${isDemo ? 'active-demo' : ''}`}
          onClick={onDemoClick}
          disabled={busy}
        >
          <Sparkles size={16} />
          <span>{busy ? 'Loading Demo…' : isDemo ? 'Demo Mode Active (Guntur)' : 'Try Demo Day (Guntur)'}</span>
        </button>

        <div className="hero-secondary-actions">
          <button className="text-button hero-ghost-btn" onClick={onImportClick} disabled={busy}>
            <FileUp size={15} />
            <span>Import Calendar (.ics)</span>
          </button>
          <span className="hero-action-sep">/</span>
          <button className="text-button hero-ghost-btn" onClick={onManualClick} disabled={busy}>
            <CalendarPlus size={15} />
            <span>Plan Manually</span>
          </button>
        </div>
      </div>

      {/* LOCATION CONTEXT SELECTOR & PRIVACY NOTICE */}
      <div className="hero-location-bar">
        <div className="location-selector-wrap">
          <button 
            className="location-pill-btn" 
            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
            aria-expanded={cityDropdownOpen}
          >
            <MapPin size={14} className="gold-icon" />
            <span className="loc-label">Active Region:</span>
            <strong className="loc-value">{selectedCity}</strong>
            <ChevronDown size={14} className={`loc-chevron ${cityDropdownOpen ? 'open' : ''}`} />
          </button>

          {cityDropdownOpen && (
            <div className="location-dropdown-menu">
              <div className="dropdown-heading">Supported Environmental Observatories</div>
              {SUPPORTED_CITIES.map((c) => (
                <button
                  key={c.name}
                  className={`dropdown-item ${selectedCity === c.query ? 'selected' : ''}`}
                  onClick={() => {
                    onSelectCity(c);
                    setCityDropdownOpen(false);
                  }}
                >
                  <div className="item-title-row">
                    <strong>{c.name}</strong>
                    {selectedCity === c.query && <span className="item-check">✓</span>}
                  </div>
                  <small className="item-desc">{c.desc}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="privacy-pill">
          <ShieldCheck size={13} />
          <span>Zero third-party tracking • Private cryptographic session</span>
        </div>
      </div>

      {/* LIVE TELEMETRY RIBBON (Real Tomorrow.io / CPCB backend data) */}
      <div className="hero-telemetry-ribbon">
        <div className="ribbon-label-col">
          <Activity size={14} className="gold-pulse" />
          <span>LIVE ATMOSPHERIC TELEMETRY</span>
        </div>
        <div className="ribbon-content">
          <LiveEnvironmentSnapshot 
            homeLocation={selectedCity} 
            liveLocation={liveLocation} 
            isDemo={isDemo} 
            chipMode={true} 
          />
        </div>
      </div>
    </section>
  );
}

export function SceneAtmosphere() {
  return (
    <section className="renaissance-section" id="scene-atmosphere">
      <div className="section-header-block">
        <div className="chapter-kicker">
          <span className="chapter-num">01</span>
          <span className="kicker-line" />
          <span className="kicker-text">THE ATMOSPHERE</span>
        </div>
        <h2 className="chapter-title">The Invisible Ocean We Inhabit</h2>
        <p className="chapter-description">
          Every human breathes over 22,000 times each day. In modern urban basins, air quality is not
          a fixed constant—it is a fluid, living atmospheric envelope governed by solar radiation,
          planetary boundary layer height, and thermal inversions.
        </p>
      </div>

      <div className="renaissance-grid three-col">
        <article className="renaissance-card editorial-depth">
          <div className="card-ornament">
            <Layers size={22} className="gold-accent" />
            <span className="card-num">I</span>
          </div>
          <h3>Boundary Layer Inversion</h3>
          <p>
            During cool mornings, a dense thermal ceiling forms below 150 meters, trapping vehicle
            exhaust and industrial particulates in high concentrations before midday solar heating
            disperses them.
          </p>
          <div className="card-stat-pill">
            <span className="stat-value">4.2×</span>
            <span className="stat-desc">Higher particulate density during morning commute</span>
          </div>
        </article>

        <article className="renaissance-card editorial-depth">
          <div className="card-ornament">
            <Wind size={22} className="gold-accent" />
            <span className="card-num">II</span>
          </div>
          <h3>Aerosol Transport Physics</h3>
          <p>
            Combustion particles (PM2.5) are aerodynamically buoyant. They channel through building
            canyons and linger along arterial roads, creating high-risk micro-corridors just meters
            away from clean, shaded side paths.
          </p>
          <div className="card-stat-pill">
            <span className="stat-value">&lt; 2.5 µm</span>
            <span className="stat-desc">Microscopic diameter able to cross alveolar barrier</span>
          </div>
        </article>

        <article className="renaissance-card editorial-depth">
          <div className="card-ornament">
            <Sun size={22} className="gold-accent" />
            <span className="card-num">III</span>
          </div>
          <h3>The Commute Paradox</h3>
          <p>
            While active commuting consumes less than 15% of your waking hours, it frequently
            accounts for over 60% of your total daily inhaled toxicant dose. Small route shifts
            yield profound exposure reductions.
          </p>
          <div className="card-stat-pill">
            <span className="stat-value">Up to 40%</span>
            <span className="stat-desc">Exposure avoided with under 10 minutes extra transit</span>
          </div>
        </article>
      </div>
    </section>
  );
}

export function SceneUrbanPollution() {
  return (
    <section className="renaissance-section" id="scene-urban">
      <div className="section-header-block">
        <div className="chapter-kicker">
          <span className="chapter-num">02</span>
          <span className="kicker-line" />
          <span className="kicker-text">THE URBAN CANOPY</span>
        </div>
        <h2 className="chapter-title">Air Quality Varies Street by Street</h2>
        <p className="chapter-description">
          Macro-city averages mask hyper-local reality. A highway bottleneck during stop-and-go
          traffic exhibits up to five times higher particulate matter than an alternate tree-lined
          corridor just two blocks away.
        </p>
      </div>

      <div className="urban-comparison-canvas">
        <div className="urban-contrast-grid">
          <div className="urban-profile high-risk">
            <div className="profile-header">
              <span className="risk-indicator high">ARTERIAL HIGHWAY CORRIDOR</span>
              <h4>The Congestion Trap</h4>
            </div>
            <p>
              High diesel exhaust, brake dust friction, and stagnant heat islands create severe
              particulate accumulation that enters vehicles via cabin ventilation.
            </p>
            <ul className="profile-metrics">
              <li><span>Typical US AQI:</span> <strong>175–220 (Unhealthy)</strong></li>
              <li><span>PM2.5 Concentration:</span> <strong>140–185 µg/m³</strong></li>
              <li><span>Modeled Commute Stress:</span> <strong>Elevated</strong></li>
            </ul>
          </div>

          <div className="urban-profile optimized-path">
            <div className="profile-header">
              <span className="risk-indicator clean">OPTIMIZED BIO-CANOPY ROUTE</span>
              <h4>The Filtered Pathway</h4>
            </div>
            <p>
              Vegetative screening, higher convective wind dispersion, and continuous movement
              dramatically lower the total inhaled dose over the same origin and destination.
            </p>
            <ul className="profile-metrics">
              <li><span>Typical US AQI:</span> <strong>75–98 (Moderate)</strong></li>
              <li><span>PM2.5 Concentration:</span> <strong>35–52 µg/m³</strong></li>
              <li><span>Time Delta:</span> <strong>+4 to +7 minutes</strong></li>
            </ul>
          </div>
        </div>

        {/* INDEX SCALE EXPLANATION */}
        <div className="aqi-editorial-scale">
          <div className="scale-heading">US Air Quality Index (AQI) Categorization Framework</div>
          <div className="scale-track">
            <div className="scale-step step-good">
              <span className="step-range">0–50</span>
              <span className="step-title">Good</span>
            </div>
            <div className="scale-step step-mod">
              <span className="step-range">51–100</span>
              <span className="step-title">Moderate</span>
            </div>
            <div className="scale-step step-sens">
              <span className="step-range">101–150</span>
              <span className="step-title">Sensitive</span>
            </div>
            <div className="scale-step step-high">
              <span className="step-range">151–200</span>
              <span className="step-title">High</span>
            </div>
            <div className="scale-step step-vhigh">
              <span className="step-range">201+</span>
              <span className="step-title">Very High</span>
            </div>
          </div>
          <p className="scale-footnote">
            Index metrics represent modeled ambient air concentrations calculated from official
            CPCB, Tomorrow.io, and Amazon Location route services. Results provide decision
            support and do not constitute clinical diagnoses.
          </p>
        </div>
      </div>
    </section>
  );
}

export function SceneEpilogue({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="renaissance-section epilogue-section" id="scene-epilogue">
      <div className="epilogue-frame">
        <div className="chapter-kicker">
          <span className="chapter-num">06</span>
          <span className="kicker-line" />
          <span className="kicker-text">EPILOGUE</span>
        </div>
        <h2 className="epilogue-title">Breathe with Intention.</h2>
        <p className="epilogue-copy">
          Your time is precious, and every breath shapes your vitality. Let mathematical
          environmental intelligence safeguard your commute while keeping your schedule intact.
        </p>
        <div className="epilogue-actions">
          <button className="primary renaissance-btn-primary large" onClick={onGetStarted}>
            <span>Optimize Today's Journeys</span>
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="epilogue-signoff">
          <span>AI Personal Pollution Optimizer · Architected on AWS Serverless</span>
        </div>
      </div>
    </section>
  );
}
