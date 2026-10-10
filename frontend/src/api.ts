import { API_BASE_URL } from './config';
import { getSessionToken } from './utils';
import type { AcceptedPlan, AgendaPayload, AnalyzeDayRequest, Coordinates, DayAnalysis, EnvironmentSnapshot, RuntimeConfig, TripAnalysis } from './types';

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getSessionToken()}`, ...(init?.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Request timed out. Try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  getDemoDay: () => request<AgendaPayload>('/api/demo/day'),
  resolvePlace: (location: string) => request<{ location: string; position: Coordinates; source: string }>('/api/places/resolve', { method: 'POST', body: JSON.stringify({ location }) }, 12_000),
  parseIcs: (icsText: string) => request<AgendaPayload>('/api/ics/parse', { method: 'POST', body: JSON.stringify({ icsText }) }, 20_000),
  analyzeDay: (payload: AnalyzeDayRequest) => request<DayAnalysis>('/api/day/analyze', { method: 'POST', body: JSON.stringify(payload) }, 75_000),
  acceptPlan: (userId: string, planId: string) => request<AcceptedPlan>('/api/plan/accept', { method: 'POST', body: JSON.stringify({ userId, planId }) }),
  history: (userId: string) => request<{ plans: AcceptedPlan[] }>(`/api/history?userId=${encodeURIComponent(userId)}`),
  communityImpact: () => request<{ totalPlans: number; totalCo2eSaved: number }>('/api/impact/community'),
  currentEnvironment: (input: { position?: Coordinates; location?: string }) => request<EnvironmentSnapshot & { position?: Coordinates }>('/api/environment/current', { method: 'POST', body: JSON.stringify(input) }, 12_000),
  runtimeConfig: () => request<RuntimeConfig>('/api/runtime-config', undefined, 8_000),
  explain: (planId: string, trip: TripAnalysis) => request<{ explanation: string; source: string }>('/api/explain', {
    method: 'POST',
    body: JSON.stringify({ planId, tripId: trip.tripId, change: trip }),
  }),
  getIndia: () => request<{ stations: Array<{ name: string; lat: number; lon: number; aqi: number; pm25: number; pm10: number; source: string; updated: string }> }>('/api/india'),
};
