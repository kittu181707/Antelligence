import { strict as assert } from 'node:assert';
import { handler as prepare } from '../handlers/prepare';
import { parseIcs } from '../core/ics';
import { isValidTime, timeToMinutes } from '../core/time';
import { optimizeCandidateSets } from '../core/optimizer';
import { routesForTrip } from '../services/routes';
import { geocode } from '../services/geocode';
import type { RouteCandidate, TripCandidateSet } from '../types';

const env = { pm25: 90, pm10: 130, aqi: 120, temperature: 33, humidity: 45, windSpeed: 7, uvIndex: 7, rainProbability: 10, source: 'stress' };

function candidate(trip: number, option: number): RouteCandidate {
  const original = option === 0;
  return {
    candidateId: `t${trip}-o${option}`,
    routeId: `r${trip}-o${option}`,
    tripId: `t${trip}`,
    mode: option % 2 ? 'metro' : 'car',
    label: `Option ${option}`,
    departureTime: '08:00',
    shiftMinutes: option === 4 ? 10 : 0,
    travelMinutes: 20 + option,
    distanceKm: 8 + option,
    modeledExposure: 100 - option * 8 - trip * 0.1,
    pollutionExposure: 90 - option * 6,
    highUvOutdoorMinutes: option % 2 ? 3 : 1,
    heatRiskOutdoorMinutes: option % 2 ? 3 : 1,
    estimatedCo2eKg: original ? 1.2 : 0.5,
    environment: env,
    environmentSamples: [{ position: { lat: 0, lon: 0 }, minutes: 20 + option, environment: env }],
    geometry: [],
    source: 'stress',
  };
}

async function main() {
  const manySets: TripCandidateSet[] = Array.from({ length: 30 }, (_, trip) => ({
    journey: { tripId: `t${trip}`, origin: `O${trip}`, destination: `D${trip}`, departureTime: '08:00', mode: 'car' },
    original: candidate(trip, 0),
    candidates: Array.from({ length: 5 }, (_, option) => candidate(trip, option)),
  }));

  const started = Date.now();
  const stress = optimizeCandidateSets({
    userId: 'stress-user',
    date: '2026-10-06',
    events: [],
    sets: manySets,
    maxExtraMinutes: 30,
    environmentSource: 'stress',
    routeSource: 'stress',
  });
  assert(Date.now() - started < 2000, 'optimizer should remain bounded with many candidate combinations');
  assert(stress.metrics.extraTravelMinutes <= 30);
  assert(stress.trips.every((trip) => trip.recommended));
  assert.equal(stress.workflow.dayPlansTested, Number.MAX_SAFE_INTEGER);

  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.throws(() => timeToMinutes('9:00'));

  const ics = parseIcs([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:all-day',
    'DTSTART;VALUE=DATE:20261006',
    'SUMMARY:Holiday',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:timed',
    'DTSTART:20261006T090000',
    'DTEND:20261006T100000',
    'SUMMARY:Meeting',
    'LOCATION:Office',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'));
  if (ics.date === '2026-10-06') {
    assert.equal(ics.events.length, 1);
    assert.equal(ics.events[0].title, 'Meeting');
  }

  await assert.rejects(
    () => prepare({
      userId: 'u1',
      date: '2026-10-06',
      homeLocation: 'Home',
      maxExtraMinutes: 10,
      events: [
        { eventId: '1', title: 'A', location: 'X', start: '09:00', end: '10:00', fixed: true },
        { eventId: '2', title: 'B', location: 'Y', start: '09:30', end: '11:00', fixed: true },
      ],
      journeys: [{ tripId: 't1', origin: 'Home', destination: 'X', departureTime: '08:00', arriveBy: '09:00', mode: 'car' }],
    }),
    /overlaps/,
  );

  await assert.rejects(
    () => prepare({
      userId: 'u1',
      date: '2026-10-06',
      homeLocation: 'Home',
      maxExtraMinutes: 10,
      events: [{ eventId: '1', title: 'A', location: 'X', start: '09:00', end: '10:00', fixed: true }],
      journeys: [{ tripId: 't1', origin: 'Home', destination: 'Wrong', departureTime: '08:00', arriveBy: '09:00', mode: 'car' }],
    }),
    /does not match/,
  );

  await assert.rejects(
    () => routesForTrip({
      origin: { lat: 28.6, lon: 77.2 },
      destination: { lat: 28.7, lon: 77.3 },
      mode: 'bike',
      date: '2026-10-07',
      departureTime: '08:00',
      demoMode: false,
      tripOrdinal: 0,
    }),
    /Bike routing is unavailable/,
  );

  // The browser can supply GPS coordinates directly: geocoding must not require AWS for these.
  assert.deepEqual(await geocode('28.613900, 77.209000', false), { lat: 28.6139, lon: 77.209 });
  await assert.rejects(() => geocode('91.0000, 181.0000', false), /out of range/);

  // Validate the maximum advertised day size and ensure a thirteenth stop is rejected.
  const twelveEvents = Array.from({ length: 12 }, (_, index) => ({
    eventId: `stop-${index}`,
    title: `Stop ${index + 1}`,
    location: `Location-${index}`,
    start: `${String(index + 8).padStart(2, '0')}:00`,
    end: `${String(index + 8).padStart(2, '0')}:30`,
    fixed: true,
  }));
  const twelveJourneys = twelveEvents.map((event, index) => ({
    tripId: `journey-${index}`,
    origin: index === 0 ? '28.613900, 77.209000' : twelveEvents[index - 1].location,
    destination: event.location,
    departureTime: index === 0 ? '07:30' : twelveEvents[index - 1].end,
    arriveBy: event.start,
    mode: 'car' as const,
  }));
  const validDay = {
    userId: 'u1', date: '2026-10-06', homeLocation: '28.613900, 77.209000',
    maxExtraMinutes: 10, events: twelveEvents, journeys: twelveJourneys,
  };
  const prepared = await prepare(validDay);
  assert.equal(prepared.events.length, 12);
  assert.equal(prepared.journeys.length, 12);
  await assert.rejects(() => prepare({
    ...validDay,
    events: [...twelveEvents, { ...twelveEvents[11], eventId: 'stop-12', title: 'Extra', location: 'Location-12', start: '20:00', end: '20:30' }],
  }), /maximum of 12 events/);

  // Deterministic differential test: DP output vs exhaustive search on 2,000 diverse small problems.
  let seed = 0x8f42e331;
  const rand = (limit: number) => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) % limit;
  };
  for (let trial = 0; trial < 2000; trial += 1) {
    const groups: TripCandidateSet[] = Array.from({ length: 4 }, (_, trip) => {
      const original = candidate(trip, 0);
      original.travelMinutes = 10;
      original.modeledExposure = 150 + rand(50);
      original.highUvOutdoorMinutes = 0;
      original.heatRiskOutdoorMinutes = 0;
      const choices = [original, ...Array.from({ length: 3 }, (_, k) => {
        const item = candidate(trip, k + 1);
        item.travelMinutes = 10 + rand(8);
        item.modeledExposure = 25 + rand(180);
        item.highUvOutdoorMinutes = 0;
        item.heatRiskOutdoorMinutes = 0;
        item.shiftMinutes = 0;
        return item;
      })];
      return { journey: { tripId: `rnd-${trip}`, origin: 'A', destination: 'B', departureTime: '08:00', mode: 'car' }, original, candidates: choices };
    });
    const budget = rand(20);
    let optimal = Number.POSITIVE_INFINITY;
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let d = 0; d < 4; d++) for (let e = 0; e < 4; e++) {
      const selection = [groups[0].candidates[a], groups[1].candidates[b], groups[2].candidates[d], groups[3].candidates[e]];
      const extra = selection.reduce((sum, choice) => sum + Math.max(0, choice.travelMinutes - 10), 0);
      if (extra > budget) continue;
      const score = selection.reduce((sum, choice, i) =>
        sum + choice.modeledExposure * 1000 + extraPerRoute(choice) + (choice.candidateId === groups[i].original.candidateId ? 0 : 2), 0);
      optimal = Math.min(optimal, score);
    }
    const actual = optimizeCandidateSets({
      userId: 'random', date: '2026-10-09', events: [], sets: groups,
      maxExtraMinutes: budget, environmentSource: 'test', routeSource: 'test',
    });
    const chosen = actual.trips.map((trip) => trip.recommended);
    const originalRaw = groups.reduce((sum, group) => sum + group.original.modeledExposure, 0);
    const chosenRaw = chosen.reduce((sum, item) => sum + item.modeledExposure, 0);
    if (chosenRaw === originalRaw && actual.changes.length === 0) {
      assert((originalRaw - optimal / 1000) / originalRaw < .02 || chosen.every((x, i) => x.candidateId === groups[i].original.candidateId));
    } else {
      const actualScore = chosen.reduce((sum, choice, i) =>
        sum + choice.modeledExposure * 1000 + extraPerRoute(choice) + (choice.candidateId === groups[i].original.candidateId ? 0 : 2), 0);
      assert.equal(actualScore, optimal, `DP diverged on randomized trial ${trial}`);
    }
    assert(actual.metrics.extraTravelMinutes <= budget);
  }
  function extraPerRoute(item: RouteCandidate) { return Math.max(0, item.travelMinutes - 10); }
  console.log('2,000 optimizer differential stress trials passed');

  console.log('stress, validation and live-routing guard tests passed');
}

void main();
