import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../types';

/**
 * Interpolated MODEL temperatures — not a satellite thermal image, a measured
 * street-level heat island map, or a navigable forecast. Open-Meteo serves
 * gridded weather-model values, so spatial detail must not be exaggerated.
 */
const GRID = 3;
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { values: number[]; validUntil: number; timestamp: number }>();

type WeatherData = { values: number[]; timestamp: number };
type WeatherStatus = 'loading' | 'ready' | 'unavailable';

const COLORS: Array<[number, number, number, number]> = [
  [-10, 42, 104, 183],
  [10, 54, 177, 198],
  [20, 86, 197, 140],
  [26, 236, 203, 70],
  [31, 250, 149, 50],
  [36, 228, 87, 44],
  [42, 164, 57, 121],
  [50, 106, 51, 156],
];

export function heatColor(celsius: number): [number, number, number] {
  if (celsius <= COLORS[0][0]) return COLORS[0].slice(1) as [number, number, number];
  for (let i = 1; i < COLORS.length; i += 1) {
    if (celsius <= COLORS[i][0]) {
      const left = COLORS[i - 1];
      const right = COLORS[i];
      const t = (celsius - left[0]) / (right[0] - left[0]);
      return [1, 2, 3].map((index) => Math.round(left[index] + (right[index] - left[index]) * t)) as [number, number, number];
    }
  }
  return COLORS[COLORS.length - 1].slice(1) as [number, number, number];
}

function validTemperature(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -95 && value <= 65;
}

export function parseWeatherSamples(raw: unknown, count = GRID * GRID): number[] {
  if (!Array.isArray(raw) || raw.length !== count) throw new Error('Weather grid is incomplete');
  return raw.map((entry) => {
    const value = (entry as { current?: { temperature_2m?: unknown } } | null)?.current?.temperature_2m;
    if (!validTemperature(value)) throw new Error('Weather model returned invalid temperature');
    return value;
  });
}

function interpolate(values: number[], nx: number, ny: number): number {
  const x = Math.max(0, Math.min(GRID - 1, nx * (GRID - 1)));
  const y = Math.max(0, Math.min(GRID - 1, ny * (GRID - 1)));
  const left = Math.min(GRID - 2, Math.floor(x));
  const top = Math.min(GRID - 2, Math.floor(y));
  const tx = x - left;
  const ty = y - top;
  const a = values[top * GRID + left];
  const b = values[top * GRID + left + 1];
  const c = values[(top + 1) * GRID + left];
  const d = values[(top + 1) * GRID + left + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function drawHeat(canvas: HTMLCanvasElement, values: number[], width: number, height: number) {
  if (width < 1 || height < 1) return;
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / 320));
  const w = Math.max(1, Math.ceil(width / scale));
  const h = Math.max(1, Math.ceil(height / scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pixels = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const temp = interpolate(values, (x + .5) / w, (y + .5) / h);
      const [r, g, b] = heatColor(temp);
      const i = (y * w + x) * 4;
      pixels.data[i] = r;
      pixels.data[i + 1] = g;
      pixels.data[i + 2] = b;
      pixels.data[i + 3] = 125;
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

export function TemperatureLayer({ active, points, width, height }: {
  active: boolean;
  points: Coordinates[];
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<WeatherData | null>(null);
  const [status, setStatus] = useState<WeatherStatus>('loading');
  // These rounded coordinates describe a viewport, not a user's precise
  // location. A small pan does not repeatedly request the same forecast.
  const key = points.map((p) => p.lat.toFixed(2) + ',' + p.lon.toFixed(2)).join('|');

  useEffect(() => {
    if (!active || points.length !== GRID * GRID) return;
    let mounted = true;
    const cached = cache.get(key);
    if (cached && cached.validUntil > Date.now()) {
      setData({ values: cached.values, timestamp: cached.timestamp });
      setStatus('ready');
      return () => { mounted = false; };
    }
    const controller = new AbortController();
    setStatus('loading');
    setData(null);
    // Debounce map panning; a single 9-location request covers just the
    // currently visible screen, rather than downloading national weather tiles.
    const timer = window.setTimeout(async () => {
      const deadline = window.setTimeout(() => controller.abort(), 9000);
      try {
        const lat = points.map((p) => p.lat.toFixed(3)).join(',');
        const lon = points.map((p) => p.lon.toFixed(3)).join(',');
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
          encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) +
          '&current=temperature_2m&temperature_unit=celsius&timezone=auto&forecast_days=1';
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Weather provider unavailable');
        const readings = parseWeatherSamples(await response.json());
        if (!mounted) return;
        const timestamp = Date.now();
        cache.set(key, { values: readings, validUntil: timestamp + TTL_MS, timestamp });
        if (cache.size > 28) cache.delete(cache.keys().next().value!);
        setData({ values: readings, timestamp });
        setStatus('ready');
      } catch {
        if (mounted) { setData(null); setStatus('unavailable'); }
      } finally {
        window.clearTimeout(deadline);
      }
    }, 650);
    return () => {
      mounted = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, key]);

  useEffect(() => {
    if (active && data && canvasRef.current) drawHeat(canvasRef.current, data.values, width, height);
  }, [active, data, width, height]);

  if (!active) return null;
  const center = data?.values[4];
  const low = data ? Math.min(...data.values) : null;
  const high = data ? Math.max(...data.values) : null;

  return <>
    {data && <canvas ref={canvasRef} className="weather-temperature-canvas" aria-hidden="true" data-weather-heatmap="ready"/>}
    <div className="weather-temperature-readout" data-weather-status={status} role="status">
      <span className="weather-temperature-eyebrow">TEMPERATURE MODEL</span>
      <strong>{center !== undefined ? Math.round(center) + '°C' : status === 'loading' ? 'Loading…' : 'Unavailable'}</strong>
      <small>{center !== undefined ? 'Near map center' : status === 'loading' ? 'Fetching latest forecast' : 'Use routes view or try again'}</small>
    </div>
    {data && <div className="weather-temperature-legend" aria-label={`Modeled temperature range ${Math.round(low!)} to ${Math.round(high!)} degrees Celsius`}>
      <div className="weather-temperature-legend-title"><span>Cooler</span><strong>Heat intensity · °C</strong><span>Hotter</span></div>
      <div className="weather-temperature-scale" style={{ background:
        'linear-gradient(90deg, ' +
        [low!, (low! + center!) / 2, center!, (center! + high!) / 2, high!]
          .map((temp) => 'rgb(' + heatColor(temp).join(',') + ')').join(', ') +
        ')' }}/>
      <div className="weather-temperature-legend-values"><span>{Math.round(low!)}°</span><span>{Math.round(center!)}°</span><span>{Math.round(high!)}°</span></div>
      <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo model · interpolated, not street-level</a>
    </div>}
  </>;
}
