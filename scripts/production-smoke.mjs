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


/**
 * Real-provider regression gate. Do NOT accept this temporary draft.
 * Unlike demo smoke, this exercises actual Amazon Location car routes,
 * environmental forecast samples, fixed-appointment feasibility and map geometry.
 */
const testDate = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
const gunturOrigin = '16.306700,80.436500';
const gunturDestination = '16.318000,80.448000';
const resolvedPlace = await request('/api/places/resolve', {
  method: 'POST', authenticated: true, body: { location: 'Guntur, Andhra Pradesh, India' }, timeout: 15_000,
});
check(resolvedPlace, 'Live AWS Places V2 lookup for typed map preview');
if (!Number.isFinite(resolvedPlace.data.position?.lat) || !Number.isFinite(resolvedPlace.data.position?.lon)) {
  throw new Error('Place resolver did not return a map-ready location');
}
console.log('AWS Places preview verified for Guntur in', resolvedPlace.durationMs, 'ms');
const liveTrip = await request('/api/day/analyze', {
  method: 'POST', authenticated: true, timeout: 29_000,
  body: {
    userId,
    date: testDate,
    homeLocation: gunturOrigin,
    maxExtraMinutes: 10,
    demoMode: false,
    events: [{ eventId: 'live-smoke-class', title: 'Class', location: gunturDestination,
      start: '11:30', end: '12:30', fixed: true }],
    journeys: [{ tripId: 'guntur-real-car', origin: gunturOrigin, destination: gunturDestination,
      departureTime: '10:30', arriveBy: '11:30', mode: 'car' }],
  },
});
check(liveTrip, 'Live Guntur Amazon Location CAR route and environmental optimizer');
const realJourney = liveTrip.data.trips?.[0];
if (liveTrip.data.workflow?.dataMode !== 'live' ||
  !String(liveTrip.data.workflow.routeSource || '').includes('Amazon Location') ||
  !realJourney || realJourney.original.mode !== 'car' ||
  !Array.isArray(realJourney.recommended.geometry) || realJourney.recommended.geometry.length < 2 ||
  !Number.isFinite(realJourney.original.modeledExposure)) {
  throw new Error('Real Guntur route has no verified AWS road geometry or modeled exposure');
}
console.log('LIVE GUNTUR CAR PASS: ' + JSON.stringify({
  date: testDate, durationMs: liveTrip.durationMs,
  provider: liveTrip.data.workflow.routeSource,
  environment: liveTrip.data.workflow.environmentSource,
  originalMode: realJourney.original.mode,
  routePoints: realJourney.recommended.geometry.length,
  choices: realJourney.candidatesEvaluated,
  accepted: false,
}));


/**
 * The production planner's actual 2-stop journey: Home → Gym → Office → Home.
 * Checks real Amazon Location road geometries and Open-Meteo modeled exposure
 * for each leg, with a valid India-local forecast day.
 * Keep as unaccepted ephemeral test draft; no impact contribution.
 */
const gunturOffice = '16.330000,80.460000';
const multi = await request('/api/day/analyze', {
  method: 'POST', authenticated: true, timeout: 29_000,
  body: {
    userId,
    date: testDate, homeLocation: gunturOrigin, maxExtraMinutes: 10, demoMode: false,
    events: [
      { eventId: 'three-leg-gym', title: 'Gym', location: gunturDestination,
        start: '09:00', end: '09:45', fixed: true },
      { eventId: 'three-leg-office', title: 'Office', location: gunturOffice,
        start: '10:15', end: '11:00', fixed: true },
    ],
    journeys: [
      { tripId: 'three-leg-1', origin: gunturOrigin, destination: gunturDestination,
        departureTime: '08:15', arriveBy: '09:00', mode: 'car' },
      { tripId: 'three-leg-2', origin: gunturDestination, destination: gunturOffice,
        departureTime: '09:45', arriveBy: '10:15', mode: 'car' },
      { tripId: 'three-leg-3', origin: gunturOffice, destination: gunturOrigin,
        departureTime: '11:00', mode: 'car' },
    ],
  },
});
check(multi, 'Real two-stop/three-leg Guntur Car environmental day analysis');
if (multi.data.workflow?.dataMode !== 'live' || multi.data.trips?.length !== 3 ||
    !String(multi.data.workflow.routeSource || '').includes('Amazon Location') ||
    !Number.isFinite(multi.data.metrics?.optimizedExposureIndex) ||
    multi.data.metrics.appointmentsChanged !== 0 ||
    multi.data.trips.some((trip) => trip.original.mode !== 'car' ||
      !Array.isArray(trip.original.geometry) || trip.original.geometry.length < 2 ||
      !Array.isArray(trip.recommended.geometry) || trip.recommended.geometry.length < 2 ||
      !Number.isFinite(trip.original.modeledExposure))) {
  throw new Error('Three-leg live itinerary did not return valid routed geometry, feasible appointments and environmental scoring');
}
console.log('LIVE GUNTUR THREE CAR LEGS PASS: ' + JSON.stringify({
  date: testDate, durationMs: multi.durationMs,
  trips: multi.data.trips.length,
  routePoints: multi.data.trips.map((trip) => trip.recommended.geometry.length),
  modes: multi.data.trips.map((trip) => trip.recommended.mode),
  provider: multi.data.workflow.routeSource,
  forecast: multi.data.workflow.environmentSource,
  exposureReductionPct: multi.data.metrics.exposureReductionPct,
  accepted: false,
}));


/** Live Bike regression: pedestrian geometry is deliberately labeled as an
 * estimated cycling journey (pedestrian or fallback motor-road graph). Do not claim bicycle-legal/safe graph coverage.
 * Never accept the disposable smoke plan or inflate community impact. */
const gunturBike = await request('/api/day/analyze', {
  method: 'POST', authenticated: true, timeout: 29_000,
  body: {
    userId, date: testDate, homeLocation: gunturOrigin,
    maxExtraMinutes: 10, demoMode: false,
    events: [{ eventId: 'bike-smoke-gym', title: 'Gym', location: gunturDestination,
      start: '11:30', end: '12:30', fixed: true }],
    journeys: [{ tripId: 'guntur-estimated-bike', origin: gunturOrigin,
      destination: gunturDestination, departureTime: '10:30',
      arriveBy: '11:30', mode: 'bike' }],
  },
});
check(gunturBike, 'Live Guntur estimated Bike trip with real AWS pedestrian geometry');
const bicycle = gunturBike.data.trips?.[0]?.original;
if (gunturBike.data.workflow?.dataMode !== 'live' ||
    !bicycle || bicycle.mode !== 'bike' ||
    !(/pedestrian geometry|car-road geometry/.test(bicycle.source || '')) ||
    !bicycle.source?.includes('not bicycle-verified') ||
    !bicycle.label?.includes('estimate') ||
    !Number.isFinite(bicycle.travelMinutes) || bicycle.travelMinutes <= 0 ||
    !Number.isFinite(bicycle.modeledExposure) ||
    !Array.isArray(bicycle.geometry) || bicycle.geometry.length < 2) {
  throw new Error('Bike option failed to return transparently sourced real AWS geometry and estimated cycling duration');
}
console.log('LIVE GUNTUR ESTIMATED BIKE PASS: ' + JSON.stringify({
  date: testDate, durationMs: gunturBike.durationMs,
  mode: bicycle.mode, minutes: bicycle.travelMinutes,
  estimated: true, bicycleAccessVerified: false,
  routePoints: bicycle.geometry.length,
  source: bicycle.source, accepted: false,
}));
