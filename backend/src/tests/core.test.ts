import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { matchesSession, sessionUserId } from '../auth';
import { optimizeCandidateSets } from '../core/optimizer';
import { snapshotFromTomorrowValues } from '../services/environment';
import { scoreRoute } from '../core/exposure';
import { futureDeparture, userFacingRoutingError } from '../services/routes';
import { workflowFailureReason } from '../handlers/analyze-api';
import { checkForecastDate, indiaToday, lastForecastDay } from '../core/time';
import type { RouteCandidate, TripCandidateSet } from '../types';

const env = { pm25: 100, pm10: 150, aqi: 160, temperature: 30, humidity: 50, windSpeed: 8, uvIndex: 3, rainProbability: 0, source: 'test' };

function c(id: string, tripId: string, minutes: number, exposure: number, shift = 0): RouteCandidate {
  return {
    candidateId: id,
    routeId: id,
    tripId,
    mode: 'car',
    label: id,
    departureTime: '08:00',
    shiftMinutes: shift,
    travelMinutes: minutes,
    distanceKm: 10,
    modeledExposure: exposure,
    pollutionExposure: exposure,
    highUvOutdoorMinutes: 0,
    heatRiskOutdoorMinutes: 0,
    estimatedCo2eKg: 1,
    environment: env,
    environmentSamples: [{ position: { lat: 0, lon: 0 }, minutes, environment: env }],
    geometry: [],
    source: 'test',
  };
}

const sets: TripCandidateSet[] = [
  {
    journey: { tripId: 't1', origin: 'A', destination: 'B', departureTime: '08:00', mode: 'car' },
    original: c('o1', 't1', 20, 100),
    candidates: [c('o1', 't1', 20, 100), c('a1', 't1', 25, 50)],
  },
  {
    journey: { tripId: 't2', origin: 'B', destination: 'C', departureTime: '10:00', mode: 'car' },
    original: c('o2', 't2', 20, 100),
    candidates: [c('o2', 't2', 20, 100), c('a2', 't2', 25, 40)],
  },
];

const tight = optimizeCandidateSets({
  userId: 'u1',
  date: '2026-01-01',
  events: [],
  sets,
  maxExtraMinutes: 5,
  environmentSource: 'test',
  routeSource: 'test',
});
assert.equal(tight.metrics.extraTravelMinutes, 5);
assert.equal(tight.changes.length, 1);
assert.equal(tight.trips[1].recommended.candidateId, 'a2');

const loose = optimizeCandidateSets({
  userId: 'u1',
  date: '2026-01-01',
  events: [],
  sets,
  maxExtraMinutes: 10,
  environmentSource: 'test',
  routeSource: 'test',
});
assert.equal(loose.changes.length, 2);
assert.equal(loose.metrics.optimizedExposureIndex, 45);
assert.equal(loose.metrics.appointmentsChanged, 0);
assert.equal(loose.userId, 'u1');

const tinyGain: TripCandidateSet[] = [{
  journey: { tripId: 't3', origin: 'C', destination: 'D', departureTime: '12:00', mode: 'car' },
  original: c('o3', 't3', 20, 100),
  candidates: [c('o3', 't3', 20, 100), c('a3', 't3', 20, 99.5)],
}];
const stable = optimizeCandidateSets({
  userId: 'u1', date: '2026-01-01', events: [], sets: tinyGain, maxExtraMinutes: 0, environmentSource: 'test', routeSource: 'test',
});
assert.equal(stable.changes.length, 0);

const tomorrow = snapshotFromTomorrowValues({
  particulateMatter25: 44,
  particulateMatter10: 71,
  epaIndex: 92,
  temperature: 29.5,
  humidity: 61,
  windSpeed: 8.4,
  uvIndex: 5.1,
  precipitationProbability: 35,
}, '2026-10-07T08:00:00Z', true);
assert.equal(tomorrow.pm25, 44);
assert.equal(tomorrow.pm10, 71);
assert.equal(tomorrow.aqi, 92);
assert.equal(tomorrow.temperature, 29.5);
assert.equal(tomorrow.humidity, 61);
assert.equal(tomorrow.windSpeed, 8.4);
assert.equal(tomorrow.rainProbability, 35);
assert(tomorrow.source.includes('Tomorrow.io realtime'));


const sampleInput = {
  candidateId: 'validated', routeId: 'validated', tripId: 't-validation',
  mode: 'walk' as const, label: 'Walking', travelMinutes: 20, distanceKm: 1.5,
  geometry: [{ lat: 16.3067, lon: 80.4365 }, { lat: 16.31, lon: 80.44 }],
  source: 'test', departureTime: '09:00', shiftMinutes: 0,
  environmentSamples: [
    { position: { lat: 16.3067, lon: 80.4365 }, minutes: 10, environment: env },
    { position: { lat: 16.31, lon: 80.44 }, minutes: 10, environment: env },
  ],
};
const scored = scoreRoute(sampleInput);
assert.equal(scored.environmentSamples.length, 2);
assert(scored.modeledExposure > 0);
assert.throws(() => scoreRoute({ ...sampleInput, travelMinutes: 0 }), /invalid travel/);
assert.throws(() => scoreRoute({
  ...sampleInput, environmentSamples: [{ ...sampleInput.environmentSamples[0], minutes: -1 }],
}), /invalid environmental/);
assert.throws(() => scoreRoute({
  ...sampleInput,
  environmentSamples: sampleInput.environmentSamples.map((item) => ({ ...item, environment: { ...item.environment, pm25: NaN } })),
}), /invalid environmental/);
assert.throws(() => scoreRoute({
  ...sampleInput, environmentSamples: [{ ...sampleInput.environmentSamples[0], minutes: 2 }],
}), /do not cover/);

const fasterPolluted = c('faster-but-polluted', 't1', 12, 130);
const noBenefit = optimizeCandidateSets({
  userId: 'u1', date: '2026-10-10', events: [], maxExtraMinutes: 0,
  environmentSource: 'test', routeSource: 'test',
  sets: [{ journey: sets[0].journey, original: sets[0].original,
    candidates: [sets[0].original, fasterPolluted] }],
});
assert.equal(noBenefit.changes.length, 0, 'a faster but more polluted route must not be mislabeled cleaner');
assert.equal(noBenefit.metrics.estimatedCo2eChangeKg, 0);

// AWS must not receive a historical departure timestamp.
assert.equal(futureDeparture('2026-10-10','08:00', Date.parse('2026-10-10T11:00:00+05:30')), false);
assert.equal(futureDeparture('2026-10-11','08:00', Date.parse('2026-10-10T11:00:00+05:30')), true);
const transitFailure = new Error('ValidationException');
transitFailure.name = 'ValidationException';
assert.match(userFacingRoutingError(transitFailure, 'bus').message, /Choose Car or Walk/);
assert.match(userFacingRoutingError(transitFailure, 'car').message, /Check both locations/);

const nestedFailure = JSON.stringify({ errorMessage: 'Live bus routing is unavailable for this journey.' });
assert.match(workflowFailureReason('States.TaskFailed', nestedFailure), /Switch those journeys to Car or Walk/);
assert.match(workflowFailureReason('ValidationException', ''), /Amazon Location rejected a live route/);
assert.match(workflowFailureReason('States.Timeout', ''), /took too long/);
assert(!workflowFailureReason('States.TaskFailed', JSON.stringify({ errorMessage: 'request had private lat: 16.32857,80.4168' })).includes('16.32857'),
  'internal GPS/stack details must not leak to the browser');

// Browser/backend in different timezones must agree on the Indian calendar day.
const indiaMidnight = new Date('2026-10-10T18:35:00Z');
assert.equal(indiaToday(indiaMidnight), '2026-10-11');
assert.equal(lastForecastDay(indiaMidnight), '2026-10-17');
assert.match(checkForecastDate('2026-10-10', indiaMidnight) || '', /past in India/);
assert.equal(checkForecastDate('2026-10-11', indiaMidnight), null);
assert.equal(checkForecastDate('2026-10-17', indiaMidnight), null);
assert.match(checkForecastDate('2026-10-18', indiaMidnight) || '', /next seven days/);

const token = 'ab'.repeat(32);
const userId = 'user-' + createHash('sha256').update(token).digest('hex').slice(0, 32);
const request = { headers: { authorization: 'Bearer ' + token } } as Pick<APIGatewayProxyEvent, 'headers'>;
assert.equal(sessionUserId(request), userId);
assert(matchesSession(request, userId));
assert(!matchesSession(request, 'user-' + '0'.repeat(32)));
assert.equal(sessionUserId({ headers: { authorization: 'Bearer invalid' } }), null);
assert.equal(sessionUserId({ headers: {} }), null);

console.log('core optimizer, session verification and environmental mapping tests passed');
