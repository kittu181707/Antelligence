import type { CalendarEvent, JourneyInput, TransportMode } from './types';

export const modes: { value: TransportMode; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'bike', label: 'Bike' },
  { value: 'bus', label: 'Bus' },
  { value: 'metro', label: 'Metro' },
  { value: 'walk', label: 'Walk' },
];

export function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

const SESSION_KEY = 'pollution_private_session_v1';
let fallbackToken: string | null = null;

export function getSessionToken(): string {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved;
  } catch { /* storage may be disabled */ }
  if (!fallbackToken) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    fallbackToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(SESSION_KEY, fallbackToken); } catch { /* session expires on reload */ }
  }
  return fallbackToken;
}

export async function getUserId(): Promise<string> {
  const token = getSessionToken();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hashed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return 'user-' + hashed.slice(0, 32);
}

export function readStoredNumber(key: string, fallback: number) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function storeNumber(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* storage is optional */ }
}

// The product and forecasting backend are currently scoped to India (UTC+05:30).
// Browser timezone can be UTC (automated runners/VPNs) even when routes are in India.
export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Open-Meteo forecast_days=7 covers the current Indian date and the next six dates.
export function lastForecastDate(now = new Date()) {
  return localDate(new Date(now.getTime() + 6 * 86_400_000));
}


export function minutesToTime(minutes: number) {
  const safe = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function timeToMinutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function shortTime(value: string) {
  const time = value.includes('T') ? value.split('T')[1]?.slice(0, 5) : value.slice(0, 5);
  if (!time) return value;
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function deriveJourneys(events: CalendarEvent[], homeLocation: string): JourneyInput[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  if (!sorted.length) return [];

  const output: JourneyInput[] = [{
    tripId: uid('trip'),
    origin: homeLocation,
    destination: sorted[0].location,
    departureTime: minutesToTime(Math.max(0, timeToMinutes(sorted[0].start) - 45)),
    arriveBy: sorted[0].start,
    mode: 'car',
  }];

  for (let index = 1; index < sorted.length; index += 1) {
    output.push({
      tripId: uid('trip'),
      origin: sorted[index - 1].location,
      destination: sorted[index].location,
      departureTime: sorted[index - 1].end,
      arriveBy: sorted[index].start,
      mode: 'car',
    });
  }

  if (sorted.at(-1)!.location.trim().toLowerCase() !== homeLocation.trim().toLowerCase()) {
    output.push({
      tripId: uid('trip'),
      origin: sorted.at(-1)!.location,
      destination: homeLocation,
      departureTime: sorted.at(-1)!.end,
      mode: 'car',
    });
  }
  return output;
}
