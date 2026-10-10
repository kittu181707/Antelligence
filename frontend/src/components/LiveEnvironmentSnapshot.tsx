import { CloudRain, Gauge, LocateFixed, RefreshCw, Sun, ThermometerSun, Wind } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Coordinates, EnvironmentSnapshot } from '../types';

type Query = { position?: Coordinates; location?: string; label: string };

const DEMO: EnvironmentSnapshot = {
  pm25: 148,
  pm10: 192,
  aqi: 186,
  temperature: 25,
  humidity: 58,
  windSpeed: 7,
  uvIndex: 2,
  rainProbability: 5,
  source: 'Controlled demo environmental data',
};

// Treat the API response as untrusted JSON; an invalid measurement must never crash React.
const REQUIRED_MEASUREMENTS = ['temperature', 'aqi', 'pm25', 'pm10', 'uvIndex', 'humidity', 'windSpeed', 'rainProbability'] as const;
export function isEnvironmentSnapshot(input: unknown): input is EnvironmentSnapshot {
  if (!input || typeof input !== 'object') return false;
  const item = input as Record<string, unknown>;
  return REQUIRED_MEASUREMENTS.every((field) => typeof item[field] === 'number' && Number.isFinite(item[field]))
    && typeof item.source === 'string' && item.source.length > 0;
}

function aqiLabel(value: number) {
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Moderate';
  if (value <= 150) return 'Sensitive';
  if (value <= 200) return 'High';
  return 'Very high';
}

function meaningfulLocation(value: string) {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized && normalized !== 'home' && normalized !== 'current location');
}

function browserPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Browser location unavailable'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      () => reject(new Error('Location permission unavailable')),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60_000 },
    );
  });
}

function ageLabel(updatedAt?: string) {
  if (!updatedAt) return 'time unavailable';
  const age = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(age) || age < 60_000) return 'retrieved now';
  return `retrieved ${Math.max(1, Math.round(age / 60_000))} min ago`;
}

export function LiveEnvironmentSnapshot({ homeLocation, liveLocation, isDemo, chipMode }: { homeLocation: string; liveLocation?: Coordinates | null; isDemo: boolean; chipMode?: boolean }) {
  const [environment, setEnvironment] = useState<EnvironmentSnapshot | null>(isDemo ? DEMO : null);
  const [query, setQuery] = useState<Query | null>(null);
  const [busy, setBusy] = useState(!isDemo);
  const [error, setError] = useState<string>();
  const [, setClock] = useState(0);
  // Small GPS movements should not clear data and launch another request every second.
  const locationKey = liveLocation ? `${liveLocation.lat.toFixed(3)},${liveLocation.lon.toFixed(3)}` : '';

  useEffect(() => {
    let active = true;

    if (isDemo) {
      setEnvironment(DEMO);
      setQuery({ label: 'Controlled demo' });
      setBusy(false);
      setError(undefined);
      return () => { active = false; };
    }

    const resolveQuery = async () => {
      if (liveLocation !== undefined) {
        if (liveLocation) {
          return { position: { lat: Number(liveLocation.lat.toFixed(3)), lon: Number(liveLocation.lon.toFixed(3)) }, label: 'Current location' } satisfies Query;
        } else if (meaningfulLocation(homeLocation)) {
          return { location: homeLocation.trim(), label: homeLocation.trim() } satisfies Query;
        }
        // If liveLocation is managed externally but is null (e.g., pending or denied),
        // we shouldn't fallback to our own browserPosition() as it would double-prompt.
        // We wait for it to be provided, or throw if we must. Actually, just throwing an error:
        throw new Error('Location pending or unavailable');
      }

      if (meaningfulLocation(homeLocation)) {
        return { location: homeLocation.trim(), label: homeLocation.trim() } satisfies Query;
      }

      const position = await browserPosition();
      return { position, label: 'Current location' } satisfies Query;
    };

    setBusy(true);
    setEnvironment(null);
    setQuery(null);
    setError(undefined);
    void resolveQuery().then((next) => {
      if (active) setQuery(next);
    }).catch(() => {
      if (!active) return;
      setBusy(false);
      setError('Set your home location or allow location access for live conditions.');
    });

    return () => { active = false; };
  }, [homeLocation, isDemo, locationKey]);

  useEffect(() => {
    if (isDemo || !query) return;
    let active = true;

    const refresh = async () => {
      setBusy(true);
      try {
        const next = await api.currentEnvironment({ position: query.position, location: query.location });
        if (!isEnvironmentSnapshot(next)) throw new Error('Incomplete environmental measurements');
        if (active) {
          setEnvironment(next);
          setError(undefined);
        }
      } catch (cause) {
        if (active) {
          setEnvironment(null); // Never show previous location/failed feed as live data.
          setError(cause instanceof Error ? cause.message : 'Live conditions unavailable');
        }
      } finally {
        if (active) setBusy(false);
      }
    };

    void refresh();
    const dataTimer = window.setInterval(() => void refresh(), 5 * 60_000);
    const clockTimer = window.setInterval(() => setClock((value) => value + 1), 60_000);
    return () => {
      active = false;
      window.clearInterval(dataTimer);
      window.clearInterval(clockTimer);
    };
  }, [query?.label, query?.location, query?.position?.lat, query?.position?.lon, isDemo]);

  const sourceLabel = useMemo(() => {
    if (isDemo) return 'DEMO DATA';
    if (!environment) return 'LIVE FEED';
    return environment.source.includes('Tomorrow.io') ? 'PROVIDER · TOMORROW.IO' : 'MODEL · OPEN-METEO';
  }, [environment, isDemo]);

  if (!environment) {
    if (chipMode) {
      return (
        <div className="environment-chip-row">
          <div className="env-chip error"><LocateFixed size={14}/> <span>{busy ? 'CONNECTING...' : 'LIVE CONDITIONS UNAVAILABLE'}</span></div>
        </div>
      );
    }
    return <section className="snapshot-card live-snapshot">
      <div className="snapshot-header">
        <div><span className="snapshot-kicker">Environmental snapshot</span><h3>Live conditions</h3></div>
        <span className="live-source-badge">{busy ? 'CONNECTING' : 'LIVE'}</span>
      </div>
      <div className="snapshot-empty">
        <LocateFixed size={21}/>
        <span>{error || 'Finding current environmental conditions…'}</span>
      </div>
    </section>;
  }

  if (chipMode) {
    return (
      <div className="environment-chip-row" title={`${environment.source} · US EPA AQI · ${ageLabel(environment.updatedAt)} · Forecast values are not street-level measurements`}>
        <div className="env-chip"><ThermometerSun size={14}/> <span>{environment.temperature.toFixed(0)}°C</span></div>
        <div className="env-chip"><Gauge size={14}/> <span>US AQI {Math.round(environment.aqi)}</span></div>
        <div className="env-chip"><Wind size={14}/> <span>PM2.5 {environment.pm25.toFixed(0)}</span></div>
        <div className="env-chip"><Wind size={14}/> <span>PM10 {environment.pm10.toFixed(0)}</span></div>
        <div className="env-chip"><Sun size={14}/> <span>UV {environment.uvIndex.toFixed(1)}</span></div>
        <div className="env-chip" title={environment.source}><span>{isDemo ? 'DEMO DATA' : `${environment.source.includes('Open-Meteo') ? 'MODEL' : 'PROVIDER'} · ${ageLabel(environment.updatedAt)}`}</span></div>
      </div>
    );
  }

  return <section className="snapshot-card live-snapshot" aria-label="Live environmental conditions">
    <div className="snapshot-header">
      <div>
        <span className="snapshot-kicker">Environmental snapshot</span>
        <h3>{query?.label || 'Along your day'}</h3>
      </div>
      <span className={`live-source-badge ${isDemo ? 'demo' : ''}`}>{sourceLabel}</span>
    </div>
    <div className="snapshot-grid">
      <div className="snapshot-metric"><Gauge size={15}/><span className="label">US AQI</span><strong>{Math.round(environment.aqi)}</strong><span className="status moderate">{aqiLabel(environment.aqi)}</span></div>
      <div className="snapshot-metric"><Wind size={15}/><span className="label">PM2.5</span><strong>{environment.pm25.toFixed(0)}</strong><small>µg/m³</small></div>
      <div className="snapshot-metric"><Wind size={15}/><span className="label">PM10</span><strong>{environment.pm10.toFixed(0)}</strong><small>µg/m³</small></div>
      <div className="snapshot-metric"><ThermometerSun size={15}/><span className="label">Temperature</span><strong>{environment.temperature.toFixed(0)}°C</strong><small>{environment.humidity.toFixed(0)}% humidity</small></div>
      <div className="snapshot-metric"><Sun size={15}/><span className="label">UV</span><strong>{environment.uvIndex.toFixed(1)}</strong><small>index</small></div>
      <div className="snapshot-metric"><CloudRain size={15}/><span className="label">Rain</span><strong>{environment.rainProbability.toFixed(0)}%</strong><small>{environment.windSpeed.toFixed(0)} km/h wind</small></div>
    </div>
    <div className="snapshot-footer">
      <span>{environment.source} · US EPA AQI, not CPCB station readings{environment.validAt ? ` · valid hour ${environment.validAt}` : ''}</span>
      <span>{busy ? <><RefreshCw className="spin" size={12}/> refreshing</> : ageLabel(environment.updatedAt)}</span>
    </div>
  </section>;
}
