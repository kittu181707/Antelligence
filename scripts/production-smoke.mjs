/**
 * Post-deployment AWS integration smoke.
 * This intentionally uses a newly generated anonymous guest identity and
 * controlled DEMO data only. It never records an actual user journey or adds
 * demonstration emissions to the real community-impact counters.
 */
import { randomBytes, createHash } from 'node:crypto';

const root = (process.env.SMOKE_API_BASE_URL || '').replace(/\/$/, '');
if (!/^https:\/\/[^/]+\/Prod$/.test(root)) throw new Error('SMOKE_API_BASE_URL must be the deployed HTTPS /Prod endpoint');
const token = randomBytes(32).toString('hex');
const userId = 'user-' + createHash('sha256').update(token).digest('hex').slice(0, 32);
const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token };

async function request(path, { method = 'GET', body, authenticated = false, timeout = 28_000 } = {}) {
  const started = Date.now();
  const response = await fetch(root + path, {
    method,
    headers: authenticated ? headers : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, durationMs: Date.now() - started };
}
function check(result, description, okay = (result) => result.status === 200) {
  if (!okay(result)) throw new Error(description + ': HTTP ' + result.status +
    ' [' + result.durationMs + 'ms] ' + JSON.stringify(result.data).slice(0, 320));
}
const demo = await request('/api/demo/day');
check(demo, 'AWS demo endpoint');
if (!demo.data.events?.length || !demo.data.homeLocation) throw new Error('Demo agenda is incomplete');

const unavailable = await request('/api/day/analyze', {
  method: 'POST', body: { userId, events: [], journeys: [] },
});
if (unavailable.status !== 401) throw new Error('Unauthenticated analysis did not return 401');
const communityBefore = await request('/api/impact/community');
check(communityBefore, 'DynamoDB community-impact endpoint');

const firstEvent = demo.data.events[0];
const payload = {
  userId, date: demo.data.date, homeLocation: demo.data.homeLocation,
  events: [firstEvent], maxExtraMinutes: 10, demoMode: true,
  journeys: [{
    tripId: 'production-qa-trip', origin: demo.data.homeLocation,
    destination: firstEvent.location, departureTime: '07:45',
    arriveBy: firstEvent.start, mode: 'car',
  }],
};

const plan = await request('/api/day/analyze', { method: 'POST', authenticated: true, body: payload, timeout: 29_000 });
check(plan, 'API Gateway -> Lambda -> Express Step Functions -> route optimization -> DynamoDB draft');
if (plan.data.workflow?.dataMode !== 'demo' || !plan.data.planId || !Array.isArray(plan.data.trips)) {
  throw new Error('AWS workflow did not produce a controlled, persisted demo analysis');
}
if (plan.durationMs > 25_000) console.warn('WARNING: even one demo trip approaches API Gateway timeout:', plan.durationMs, 'ms');
const explain = await request('/api/explain', {
  method: 'POST', authenticated: true,
  body: { planId: plan.data.planId, tripId: plan.data.trips[0].tripId, change: plan.data.trips[0] },
});
check(explain, 'Bedrock-or-deterministic explanation endpoint');
if (!explain.data.explanation || !explain.data.source) throw new Error('Explanation provenance is unavailable');

const acceptedBody = { userId, planId: plan.data.planId };
const accepted = await request('/api/plan/accept', { method: 'POST', authenticated: true, body: acceptedBody });
check(accepted, 'DynamoDB transactional accept');
if (!accepted.data.acceptedAt) throw new Error('Accepted demo plan missing acceptedAt');
const acceptedAgain = await request('/api/plan/accept', { method: 'POST', authenticated: true, body: acceptedBody });
check(acceptedAgain, 'DynamoDB idempotent duplicate accept');
if (acceptedAgain.data.acceptedAt !== accepted.data.acceptedAt) {
  throw new Error('Repeated acceptance created a new acceptedAt timestamp');
}

const ownHistory = await request('/api/history?userId=' + encodeURIComponent(userId), { authenticated: true });
check(ownHistory, 'Authenticated history');
const matches = ownHistory.data.plans?.filter((item) => item.planId === plan.data.planId) || [];
if (matches.length !== 1) throw new Error('History did not return the single accepted plan (got ' + matches.length + ')');

const strangerToken = randomBytes(32).toString('hex');
const stranger = await fetch(root + '/api/history?userId=' + encodeURIComponent(userId), {
  headers: { authorization: 'Bearer ' + strangerToken },
  signal: AbortSignal.timeout(8_000),
});
if (stranger.status !== 403) throw new Error('Different anonymous guest can read other user history: ' + stranger.status);
const communityAfter = await request('/api/impact/community');
check(communityAfter, 'Impact after accepting demo plan');
if (communityAfter.data.totalPlans !== communityBefore.data.totalPlans ||
    communityAfter.data.totalCo2eSaved !== communityBefore.data.totalCo2eSaved) {
  console.warn('WARNING: impact totals changed during test (could be concurrent real acceptance). Review DynamoDB history.');
}
console.log(JSON.stringify({
  passed: true, anonymousSessionProtected: true, demoPersistedOnce: true,
  explanationSource: explain.data.source,
  awsPipelineDemoMs: plan.durationMs,
  acceptedHistoryCount: matches.length,
  demoExcludedFromImpact: communityAfter.data.totalPlans === communityBefore.data.totalPlans &&
    communityAfter.data.totalCo2eSaved === communityBefore.data.totalCo2eSaved,
  note: 'This proves the controlled demo workflow, NOT live route availability in all cities.',
}, null, 2));

// The six-city overview is a model-coverage probe, not a physical station audit.
try {
  const overview = await request('/api/india', { timeout: 29_000 });
  if (overview.status === 200 && Array.isArray(overview.data.stations)) {
    const expected = ['Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Guntur'];
    for (const city of expected) {
      const item = overview.data.stations.find((station) => station.name === city);
      if (!item) console.warn('MODEL CITY MISSING:', city);
      else console.log('MODEL CITY', city, ':', item.aqi === null ? 'UNAVAILABLE' : 'US AQI ' + item.aqi,
        '|', item.source, '|', item.updated);
    }
  } else console.warn('Six-city model overview unavailable: HTTP', overview.status);
} catch (error) {
  console.warn('Six-city model overview unavailable:', String(error));
}

const cities = [
  { name: 'Guntur', lat: 16.3067, lon: 80.4365 },
  { name: 'Delhi', lat: 28.6139, lon: 77.2090 },
];
for (const city of cities) {
  try {
    const result = await request('/api/environment/current', {
      method: 'POST', body: { position: { lat: city.lat, lon: city.lon } }, timeout: 18_000,
    });
    if (result.status !== 200 || !Number.isFinite(result.data.pm25) ||
        !Number.isFinite(result.data.aqi) || !result.data.source ||
        result.data.source.includes('Controlled demo')) {
      throw new Error('Unusable or wrongly labeled model feed (HTTP ' + result.status + ')');
    }
    console.log('MODEL COVERAGE ' + city.name + ': ' + result.durationMs + 'ms, ' +
      result.data.source + ', US AQI=' + result.data.aqi);
  } catch (error) {
    console.warn('MODEL COVERAGE unavailable ' + city.name + ': ' + String(error));
    // External weather providers may be unavailable; report, do not fabricate.
  }
}
