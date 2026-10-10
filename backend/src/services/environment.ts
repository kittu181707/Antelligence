import type { Coordinates, EnvironmentSnapshot } from '../types';

type CacheEntry = { value: EnvironmentSnapshot; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<EnvironmentSnapshot>>();
const CACHE_TTL_MS = 5 * 60_000;

const TOMORROW_FIELDS = [
  'temperature',
  'humidity',
  'windSpeed',
  'uvIndex',
  'precipitationProbability',
  'particulateMatter25',
  'particulateMatter10',
  'epaIndex',
];

export async function environmentAt(
  position: Coordinates,
  date: string,
  departureTime: string,
  demoMode: boolean,
): Promise<EnvironmentSnapshot> {
  if (demoMode) return demoEnvironment(departureTime);

  const hour = departureTime.slice(0, 2);
  const provider = process.env.TOMORROW_IO_API_KEY?.trim() ? 'tomorrow' : 'open-meteo';
  const key = `forecast|${provider}|${position.lat.toFixed(3)},${position.lon.toFixed(3)}|${date}T${hour}`;
  return cachedLoad(key, () => loadEnvironment(position, date, hour));
}

export async function currentEnvironmentAt(position: Coordinates): Promise<EnvironmentSnapshot> {
  const provider = process.env.TOMORROW_IO_API_KEY?.trim() ? 'tomorrow' : 'open-meteo';
  const key = `current|${provider}|${position.lat.toFixed(3)},${position.lon.toFixed(3)}`;
  return cachedLoad(key, () => loadCurrentEnvironment(position));
}

async function cachedLoad(key: string, loader: () => Promise<EnvironmentSnapshot>) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(key);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = loader().then((result) => {
    cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }).finally(() => pending.delete(key));

  pending.set(key, request);
  return request;
}

async function loadEnvironment(position: Coordinates, date: string, hour: string): Promise<EnvironmentSnapshot> {
  const apiKey = process.env.TOMORROW_IO_API_KEY?.trim();
  if (apiKey) {
    try {
      return await loadTomorrow(position, targetIso(date, hour), false, apiKey);
    } catch (error) {
      console.warn('Tomorrow.io forecast unavailable; using Open-Meteo fallback:', error);
    }
  }
  return loadOpenMeteo(position, date, hour, false);
}

async function loadCurrentEnvironment(position: Coordinates): Promise<EnvironmentSnapshot> {
  const apiKey = process.env.TOMORROW_IO_API_KEY?.trim();
  if (apiKey) {
    try {
      return await loadTomorrow(position, 'now', true, apiKey);
    } catch (error) {
      console.warn('Tomorrow.io realtime unavailable; using Open-Meteo fallback:', error);
    }
  }

  const now = dateAndHourInOffset();
  return loadOpenMeteo(position, now.date, now.hour, true);
}

async function loadTomorrow(
  position: Coordinates,
  startTime: string,
  current: boolean,
  apiKey: string,
): Promise<EnvironmentSnapshot> {
  const url = `https://api.tomorrow.io/v4/timelines?apikey=${encodeURIComponent(apiKey)}`;
  const payload = {
    location: `${position.lat},${position.lon}`,
    fields: TOMORROW_FIELDS,
    units: 'metric',
    timesteps: [current ? 'current' : '1h'],
    startTime,
    ...(current ? {} : { endTime: plusHours(startTime, 1) }),
  };

  const result = await fetchJson(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'accept-encoding': 'gzip, deflate, br',
    },
    body: JSON.stringify(payload),
  });

  const interval = result?.data?.timelines?.[0]?.intervals?.[0];
  if (!interval?.values) throw new Error('Tomorrow.io returned no environmental interval');

  return snapshotFromTomorrowValues(interval.values, interval.startTime, current);
}

export function snapshotFromTomorrowValues(
  values: Record<string, unknown>,
  validAt?: string,
  current = false,
): EnvironmentSnapshot {
  return {
    pm25: requiredNumber(values.particulateMatter25, 'PM2.5', 0),
    pm10: requiredNumber(values.particulateMatter10, 'PM10', 0),
    aqi: requiredNumber(values.epaIndex, 'AQI', 0),
    temperature: requiredNumber(values.temperature, 'temperature'),
    humidity: requiredNumber(values.humidity, 'humidity', 0),
    windSpeed: requiredNumber(values.windSpeed, 'wind speed', 0),
    uvIndex: requiredNumber(values.uvIndex, 'UV index', 0),
    rainProbability: requiredNumber(values.precipitationProbability, 'rain probability', 0),
    source: current ? 'Tomorrow.io realtime environmental data' : 'Tomorrow.io live forecast environmental data',
    updatedAt: new Date().toISOString(),
    validAt,
  };
}

async function loadOpenMeteo(
  position: Coordinates,
  date: string,
  hour: string,
  current: boolean,
): Promise<EnvironmentSnapshot> {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${position.lat}&longitude=${position.lon}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m,uv_index&forecast_days=7&timezone=auto`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${position.lat}&longitude=${position.lon}&hourly=pm10,pm2_5,us_aqi&forecast_days=7&timezone=auto`;
  const [weather, air] = await Promise.all([fetchJson(weatherUrl), fetchJson(airUrl)]);
  const targetPrefix = `${date}T${hour}:`;
  const weatherIndex = findTime(weather.hourly?.time, targetPrefix);
  const airIndex = findTime(air.hourly?.time, targetPrefix);
  const validAt = weather.hourly?.time?.[weatherIndex];

  return {
    pm25: requiredNumber(air.hourly?.pm2_5?.[airIndex], 'PM2.5', 0),
    pm10: requiredNumber(air.hourly?.pm10?.[airIndex], 'PM10', 0),
    aqi: requiredNumber(air.hourly?.us_aqi?.[airIndex], 'AQI', 0),
    temperature: requiredNumber(weather.hourly?.temperature_2m?.[weatherIndex], 'temperature'),
    humidity: requiredNumber(weather.hourly?.relative_humidity_2m?.[weatherIndex], 'humidity', 0),
    windSpeed: requiredNumber(weather.hourly?.wind_speed_10m?.[weatherIndex], 'wind speed', 0),
    uvIndex: requiredNumber(weather.hourly?.uv_index?.[weatherIndex], 'UV index', 0),
    rainProbability: requiredNumber(weather.hourly?.precipitation_probability?.[weatherIndex], 'rain probability', 0),
    source: current ? 'Open-Meteo current-hour model forecast (US EPA AQI, not monitoring-station observations)' : 'Open-Meteo hourly model forecast (US EPA AQI, not monitoring-station observations)',
    updatedAt: new Date().toISOString(),
    validAt,
  };
}

function demoEnvironment(time: string): EnvironmentSnapshot {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute;
  if (total < 660) return demoSnapshot(148, 192, 186, 25, 58, 7, 2, 5);
  if (total < 1020) return demoSnapshot(82, 126, 121, 38, 38, 10, 8.2, 8);
  if (total < 1200) return demoSnapshot(176, 236, 214, 31, 52, 6, 2.8, 25);
  return demoSnapshot(118, 170, 158, 27, 72, 14, .2, 72);
}

function demoSnapshot(
  pm25: number,
  pm10: number,
  aqi: number,
  temperature: number,
  humidity: number,
  windSpeed: number,
  uvIndex: number,
  rainProbability: number,
): EnvironmentSnapshot {
  return {
    pm25,
    pm10,
    aqi,
    temperature,
    humidity,
    windSpeed,
    uvIndex,
    rainProbability,
    source: 'Controlled demo environmental data',
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`Environmental feed failed (${response.status})`);
      return await response.json() as any;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Environmental feed unavailable');
}

function findTime(times: unknown, prefix: string) {
  if (!Array.isArray(times)) throw new Error('Environmental feed returned no timeline');
  const index = times.findIndex((time) => typeof time === 'string' && time.startsWith(prefix));
  if (index < 0) throw new Error('Environmental data is unavailable for the selected day/time');
  return index;
}

function requiredNumber(value: unknown, label: string, minimum?: number) {
  if (value === null || value === undefined || value === '') throw new Error(`Environmental feed is missing ${label}`);
  const number = Number(value);
  if (!Number.isFinite(number) || (minimum !== undefined && number < minimum)) {
    throw new Error(`Environmental feed returned invalid ${label}`);
  }
  return number;
}

function targetIso(date: string, hour: string) {
  const offset = process.env.APP_TIMEZONE_OFFSET || '+05:30';
  return `${date}T${hour}:00:00${offset}`;
}

function plusHours(value: string, hours: number) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid forecast timestamp');
  return new Date(timestamp + hours * 3_600_000).toISOString();
}

function dateAndHourInOffset() {
  const offset = process.env.APP_TIMEZONE_OFFSET || '+05:30';
  if (offset === 'Z') {
    const now = new Date();
    return { date: now.toISOString().slice(0, 10), hour: now.toISOString().slice(11, 13) };
  }

  const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  const sign = match?.[1] === '-' ? -1 : 1;
  const minutes = match ? sign * (Number(match[2]) * 60 + Number(match[3])) : 330;
  const shifted = new Date(Date.now() + minutes * 60_000);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.toISOString().slice(11, 13) };
}
