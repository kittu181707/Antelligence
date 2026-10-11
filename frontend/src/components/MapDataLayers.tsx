import { useEffect, useMemo, useState } from 'react';
import type { Coordinates, TripAnalysis } from '../types';

export type InsightPoint = Coordinates & { x: number; y: number };
type AirReading = { aqi: number; pm25: number; pm10: number; validAt: string };
type WeatherReading = { temperature: number; feels: number; humidity: number; wind: number; direction: number; rain: number | null; uv: number | null; validAt: string };
type FetchStatus = 'loading' | 'ready' | 'unavailable';

const TTL = 10 * 60_000;
const airCache = new Map<string, { values: AirReading[]; until: number }>();
const weatherCache = new Map<string, { values: WeatherReading[]; until: number }>();

function finite(value: unknown, lo = 0, hi = 1_000): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi ? value : null;
}
function required(value: unknown, label: string, lo = 0, hi = 1_000): number {
  const n = finite(value, lo, hi);
  if (n === null) throw new Error('Invalid ' + label + ' in model');
  return n;
}
export function airQualityBand(aqi: number): { label: string; color: string } {
  if (aqi <= 50) return { label: 'Good', color: '#0f9963' };
  if (aqi <= 100) return { label: 'Moderate', color: '#bf8f0b' };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', color: '#e77824' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#dc4045' };
  if (aqi <= 300) return { label: 'Very unhealthy', color: '#863fa4' };
  return { label: 'Hazardous', color: '#7f2642' };
}
export function uvBand(index: number): { label: string; color: string } {
  if (index < 3) return { label: 'Low', color: '#169c63' };
  if (index < 6) return { label: 'Moderate', color: '#b18a00' };
  if (index < 8) return { label: 'High', color: '#e27e1d' };
  if (index < 11) return { label: 'Very high', color: '#dc4151' };
  return { label: 'Extreme', color: '#843ca2' };
}
export function parseAirModel(raw: unknown, expected = 9): AirReading[] {
  if (!Array.isArray(raw) || raw.length !== expected) throw new Error('Incomplete air-quality model grid');
  return raw.map((entry: any) => ({
    aqi: required(entry?.current?.us_aqi, 'AQI', 0, 500),
    pm25: required(entry?.current?.pm2_5, 'PM2.5', 0, 1000),
    pm10: required(entry?.current?.pm10, 'PM10', 0, 1500),
    validAt: typeof entry?.current?.time === 'string' ? entry.current.time : 'Model valid time unavailable',
  }));
}
function parseWeatherModel(raw: unknown, expected = 9): WeatherReading[] {
  if (!Array.isArray(raw) || raw.length !== expected) throw new Error('Incomplete weather model grid');
  return raw.map((entry: any) => {
    const now = entry?.current || {};
    const hours = entry?.hourly?.time;
    const index = Array.isArray(hours) && typeof now.time === 'string'
      ? hours.findIndex((t: unknown) => typeof t === 'string' && t.slice(0, 13) === now.time.slice(0, 13)) : -1;
    return {
      temperature: required(now.temperature_2m, 'temperature', -95, 65),
      feels: required(now.apparent_temperature, 'apparent temperature', -95, 75),
      humidity: required(now.relative_humidity_2m, 'humidity', 0, 100),
      wind: required(now.wind_speed_10m, 'wind speed', 0, 300),
      direction: required(now.wind_direction_10m, 'wind direction', 0, 360),
      rain: index >= 0 ? finite(entry?.hourly?.precipitation_probability?.[index], 0, 100) : null,
      uv: index >= 0 ? finite(entry?.hourly?.uv_index?.[index], 0, 25) : null,
      validAt: typeof now.time === 'string' ? now.time : 'Model valid time unavailable',
    };
  });
}

type ModelKind = 'air' | 'weather';
function useMapModel<T>(kind: ModelKind, active: boolean, points: InsightPoint[]): { status: FetchStatus; values: T[] | null } {
  const cache = kind === 'air' ? airCache : weatherCache;
  const key = useMemo(() => points.map(p => p.lat.toFixed(2) + ':' + p.lon.toFixed(2)).join('|'), [points]);
  const [data, setData] = useState<{ status: FetchStatus; values: T[] | null }>({ status: 'loading', values: null });
  useEffect(() => {
    if (!active || points.length !== 9) return;
    const cached = cache.get(key);
    if (cached && cached.until > Date.now()) {
      setData({ status: 'ready', values: cached.values as T[] });
      return;
    }
    setData({ status: 'loading', values: null });
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      const timeout = window.setTimeout(() => abort.abort(), 9000);
      try {
        const qs = 'latitude=' + encodeURIComponent(points.map(p => p.lat.toFixed(3)).join(',')) +
          '&longitude=' + encodeURIComponent(points.map(p => p.lon.toFixed(3)).join(','));
        const url = kind === 'air'
          ? 'https://air-quality-api.open-meteo.com/v1/air-quality?' + qs + '&current=us_aqi,pm2_5,pm10&timezone=auto&forecast_days=1'
          : 'https://api.open-meteo.com/v1/forecast?' + qs +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m' +
            '&hourly=uv_index,precipitation_probability&timezone=auto&forecast_days=1';
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error('Model unavailable');
        const raw = await response.json();
        const values = (kind === 'air' ? parseAirModel(raw) : parseWeatherModel(raw)) as T[];
        if (!abort.signal.aborted) {
          cache.set(key, { values: values as any, until: Date.now() + TTL });
          if (cache.size > 30) cache.delete(cache.keys().next().value!);
          setData({ status: 'ready', values });
        }
      } catch {
        if (!abort.signal.aborted) setData({ status: 'unavailable', values: null });
      } finally { window.clearTimeout(timeout); }
    }, 650);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [kind, active, key]);
  return data;
}

function ModelNotice({ title, status }: { title: string; status: FetchStatus }) {
  return <div className="insight-model-notice" role="status">
    <strong>{title}</strong>
    <span>{status === 'loading' ? 'Loading live model grid…' :
      'Model data unavailable. Try again later or use Routes.'}</span>
  </div>;
}

export function AirQualityLayer({ active, points }: { active: boolean; points: InsightPoint[] }) {
  const { status, values } = useMapModel<AirReading>('air', active, points);
  const [selected, setSelected] = useState<number | null>(null);
  if (!active) return null;
  return <>
    {values?.map((reading, index) => {
      const band = airQualityBand(reading.aqi);
      return <button type="button" key={index} className="insight-sample insight-air-marker"
        style={{ left: points[index]?.x, top: points[index]?.y, background: band.color }}
        aria-label={`Modeled AQI ${Math.round(reading.aqi)} at sample ${index + 1}`}
        title={`Model AQI ${reading.aqi} · ${band.label}`} onClick={() => setSelected(index)}>
        <span>AQI</span><strong>{Math.round(reading.aqi)}</strong>
      </button>;
    })}
    {values && <div className="insight-legend" role="note">
      <strong>AQI · US EPA · modeled, not observed</strong>
      <div className="insight-aqi-scale">
        {['#0f9963','#bf8f0b','#e77824','#dc4045','#863fa4','#7f2642'].map(c => <i key={c} style={{background:c}}/>)}
      </div>
      <span>Good → Moderate → Sensitive → Unhealthy → Very unhealthy → Hazardous</span>
      <small>Open-Meteo CAMS forecast grid. These are NOT CPCB monitoring stations or measured street-level AQI.</small>
    </div>}
    {!values && <ModelNotice title="Air quality · AQI / PM2.5 / PM10" status={status}/>}
    {values && selected !== null && values[selected] && <div className="insight-detail" role="status">
      <button type="button" aria-label="Close air quality details" onClick={() => setSelected(null)}>×</button>
      <strong>Model sample {selected + 1} · {airQualityBand(values[selected].aqi).label}</strong>
      <span>US AQI {Math.round(values[selected].aqi)} · PM2.5 {values[selected].pm25.toFixed(1)} µg/m³ · PM10 {values[selected].pm10.toFixed(1)} µg/m³</span>
      <small>Valid: {values[selected].validAt} · Open-Meteo/CAMS model forecast, not station observation.</small>
    </div>}
  </>;
}

export function WeatherInsightLayer({ active, kind, points }: { active: boolean; kind: 'weather' | 'uv'; points: InsightPoint[] }) {
  const { status, values } = useMapModel<WeatherReading>('weather', active, points);
  const [selected, setSelected] = useState<number | null>(null);
  if (!active) return null;
  const center = values?.[4];
  const info = selected !== null && values ? values[selected] : center;
  return <>
    {kind === 'uv' && values?.map((reading, i) => reading.uv === null ? null : <button key={i} type="button"
      className="insight-sample insight-uv-marker" style={{ left: points[i]?.x, top: points[i]?.y, background: uvBand(reading.uv).color }}
      aria-label={`Modeled UV index ${reading.uv.toFixed(1)} at sample ${i+1}`}
      title={`Modeled UV index · ${uvBand(reading.uv).label}`} onClick={() => setSelected(i)}>
      <span>UV</span><strong>{reading.uv.toFixed(1)}</strong>
    </button>)}
    {center && <div className="insight-weather-card" role="status">
      <strong>{kind === 'weather' ? 'Weather at map center' : 'UV exposure · forecast'}</strong>
      {kind === 'weather' ? <>
        <span><b>{center.temperature.toFixed(0)}°C</b> air · feels {center.feels.toFixed(0)}°C</span>
        <span>Humidity {center.humidity.toFixed(0)}% · Wind {center.wind.toFixed(0)} km/h, {center.direction.toFixed(0)}°</span>
        <span>Rain chance: {center.rain === null ? 'Not available' : center.rain.toFixed(0) + '%'}</span>
        <span>UV index: {center.uv === null ? 'Not available' : center.uv.toFixed(1) + ' · ' + uvBand(center.uv).label}</span>
      </> : <span>{info?.uv === null ? 'UV forecast unavailable' : `${info?.uv.toFixed(1)} · ${uvBand(info!.uv!).label}`}</span>}
      <small>Valid {center.validAt} · Open-Meteo model forecast, not a weather station.</small>
    </div>}
    {kind === 'uv' && values && <div className="insight-legend">
      <strong>UV index · model forecast</strong><div className="insight-aqi-scale">
        {['#169c63','#b18a00','#e27e1d','#dc4151','#843ca2'].map(c => <i key={c} style={{background:c}}/>)}
      </div><span>Low → Moderate → High → Very high → Extreme</span>
    </div>}
    {!values && <ModelNotice title={kind === 'uv' ? 'UV forecast' : 'Live weather model'} status={status}/>}
  </>;
}

export function TrafficLayer({ active, trips }: { active: boolean; trips: TripAnalysis[] }) {
  if (!active) return null;
  return <div className="insight-traffic-card" role="status">
    <strong>Traffic · routing context</strong>
    {trips.length ? trips.map((trip, i) => <div key={trip.tripId}>
      <b>Journey {i+1}</b><span>Original {trip.original.travelMinutes} min · Alternative {trip.recommended.travelMinutes} min</span>
    </div>) : <p>Analyze a day to compare travel times for the selected routes.</p>}
    <p><b>Live road congestion unavailable.</b> This OpenStreetMap basemap does not supply verified green/yellow/red traffic segments or incident delays. Times are route estimates, not a citywide traffic layer.</p>
  </div>;
}

type ExposurePin = { x: number; y: number; aqi: number; pm25: number; mode: string; source: string; validAt?: string };
export function ExposureLayer({ active, trips, projectPoint, isDemo }: {
  active: boolean; trips: TripAnalysis[]; projectPoint: (point: Coordinates) => {x:number;y:number}; isDemo: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const pins: ExposurePin[] = useMemo(() => trips.flatMap(trip =>
    [trip.original, trip.recommended].flatMap((candidate, index) =>
      (candidate.environmentSamples || []).slice(0, 10).map(sample => ({
        ...projectPoint(sample.position), aqi: sample.environment.aqi, pm25: sample.environment.pm25,
        mode: (index ? 'Optimized' : 'Original') + ' ' + candidate.mode,
        source: sample.environment.source, validAt: sample.environment.validAt,
      })))), [trips, projectPoint]);
  if (!active) return null;
  const original = trips.reduce((sum, trip) => sum + trip.original.modeledExposure, 0);
  const optimized = trips.reduce((sum, trip) => sum + trip.recommended.modeledExposure, 0);
  const originalCo2 = trips.reduce((sum, trip) => sum + trip.original.estimatedCo2eKg, 0);
  const optimizedCo2 = trips.reduce((sum, trip) => sum + trip.recommended.estimatedCo2eKg, 0);
  return <>
    {pins.map((pin, i) => <button key={i} type="button" className="insight-exposure-pin"
      style={{ left: pin.x, top: pin.y, background: airQualityBand(pin.aqi).color }}
      aria-label={`Modeled exposure sample ${i+1}: AQI ${Math.round(pin.aqi)}`}
      title="Click for modeled route sampling details" onClick={() => setSelected(i)}>{Math.round(pin.aqi)}</button>)}
    <div className="insight-exposure-card" role="status">
      <strong>Personal exposure · {isDemo ? 'controlled demo' : 'modeled estimate'}</strong>
      {trips.length ? <>
        <span>Exposure index: {original.toFixed(0)} → <b>{optimized.toFixed(0)}</b></span>
        <span>Estimated CO₂e: {originalCo2.toFixed(2)} → {optimizedCo2.toFixed(2)} kg</span>
        <small>{pins.length} sample locations · Colors show sample AQI only, not street-by-street pollution.</small>
      </> : <p>Analyze your journeys to see exposure and carbon estimates on the map.</p>}
    </div>
    {selected !== null && pins[selected] && <div className="insight-detail" role="status">
      <button type="button" aria-label="Close exposure sample" onClick={() => setSelected(null)}>×</button>
      <strong>{pins[selected].mode} · modeled sample</strong>
      <span>AQI {pins[selected].aqi.toFixed(0)} · PM2.5 {pins[selected].pm25.toFixed(1)} µg/m³</span>
      <small>{pins[selected].source}{pins[selected].validAt ? ' · valid '+pins[selected].validAt : ''}</small>
    </div>}
  </>;
}
