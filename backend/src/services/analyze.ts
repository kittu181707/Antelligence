import type {
  AnalyzeDayRequest,
  BaseRoute,
  PreparedRequest,
  RouteCandidate,
  RouteEnvironmentSample,
  TransportMode,
  TripCandidateSet,
  Coordinates,
  JourneyInput,
} from '../types';
import { geocode } from './geocode';
import { routesForTrip } from './routes';
import { environmentAt } from './environment';
import { scoreRoute } from '../core/exposure';
import { shiftTime, timeToMinutes, availableMinutes } from '../core/time';
import { optimizeCandidateSets } from '../core/optimizer';

export const TIME_SHIFT_OPTIONS = [-30, 0, 30] as const;
export const ALT_MODE_ORDER: TransportMode[] = ['metro', 'bus', 'car', 'bike', 'walk'];
const MAX_ENVIRONMENT_SAMPLES = 3;

type RouteJob = {
  mode: TransportMode;
  shift: number;
  departureTime: string;
  includeAlternative: boolean;
};

type CandidateSetResult = {
  set: TripCandidateSet;
  environmentSources: string[];
  routeSources: string[];
};

export async function runDirectAnalysis(input: PreparedRequest | AnalyzeDayRequest) {
  const started = Date.now();
  const demoMode = input.demoMode ?? process.env.DEMO_MODE === 'true';

  const results = await Promise.all(input.journeys.map((journey, index) =>
    buildCandidateSet(input, journey, index, demoMode),
  ));

  const analysis = optimizeCandidateSets({
    userId: input.userId,
    date: input.date,
    events: input.events,
    sets: results.map((result) => result.set),
    maxExtraMinutes: input.maxExtraMinutes,
    environmentSource: unique(results.flatMap((result) => result.environmentSources)).join(' + ') || 'unknown',
    routeSource: unique(results.flatMap((result) => result.routeSources)).join(' + ') || 'unknown',
    dataMode: demoMode ? 'demo' : 'live',
  });

  analysis.workflow.analysisDurationMs = Date.now() - started;
  return analysis;
}

async function buildCandidateSet(
  input: PreparedRequest | AnalyzeDayRequest,
  journey: JourneyInput,
  index: number,
  demoMode: boolean,
): Promise<CandidateSetResult> {
  const environmentSources = new Set<string>();
  const routeSources = new Set<string>();
  const [origin, destination] = await Promise.all([
    geocode(journey.origin, demoMode),
    geocode(journey.destination, demoMode),
  ]);

  const earliestDeparture = earliestDepartureForJourney(input.events, journey.origin, journey.destination, journey.arriveBy);
  const jobs: RouteJob[] = [];

  for (const shift of TIME_SHIFT_OPTIONS) {
    const shiftedMinutes = timeToMinutes(journey.departureTime) + shift;
    if (shiftedMinutes < 0 || shiftedMinutes >= 1440) continue; // Single-day model.
    const departureTime = shiftTime(journey.departureTime, shift);
    if (earliestDeparture && timeToMinutes(departureTime) < timeToMinutes(earliestDeparture)) continue;
    if (availableMinutes(departureTime, journey.arriveBy) <= 0) continue;
    jobs.push({ mode: journey.mode, shift, departureTime, includeAlternative: shift === 0 });
  }

  // Every mode can now be selected. Test real transit coverage where the
  // provider supports it; failed live modes return clearly labeled estimates.
  // We never auto-recommend an unverified estimated transit connection.
  for (const mode of ALT_MODE_ORDER.filter((mode) => mode !== journey.mode)) {
    jobs.push({ mode, shift: 0, departureTime: journey.departureTime, includeAlternative: false });
  }

  const settled = await Promise.allSettled(jobs.map(async (job) => {
    const routes = await routesForTrip({
      origin,
      destination,
      mode: job.mode,
      date: input.date,
      departureTime: job.departureTime,
      arriveBy: journey.arriveBy,
      demoMode,
      tripOrdinal: index,
    });
    return { job, routes };
  }));

  const routeCandidates: Array<{ route: BaseRoute; job: RouteJob }> = [];
  let originalRoutingError: unknown;

  settled.forEach((result, jobIndex) => {
    const job = jobs[jobIndex];
    if (result.status === 'rejected') {
      if (job.mode === journey.mode && job.shift === 0) originalRoutingError = result.reason;
      return;
    }

    const limit = result.value.job.includeAlternative ? 3 : 1;
    for (const route of result.value.routes.slice(0, limit)) {
      if (route.mode !== journey.mode && !isRealisticAlternative(route)) continue;
      // An estimated corridor is useful to explain a chosen mode, but it is
      // not evidence that a bus or metro actually runs there. Never silently
      // change someone's mode onto an unverified connection.
      if (route.mode !== journey.mode && (route.source.startsWith('Planning estimate') ||
          route.source.includes('not bicycle-verified'))) continue;
      if (route.travelMinutes > availableMinutes(job.departureTime, journey.arriveBy)) continue;
      routeSources.add(route.source);
      routeCandidates.push({ route, job });
    }
  });

  if (originalRoutingError) {
    throw originalRoutingError instanceof Error
      ? originalRoutingError
      : new Error('Could not route this journey. Check its locations and selected travel mode.');
  }

  const originalRoute = routeCandidates.find(({ route, job }) =>
    route.mode === journey.mode && job.shift === 0,
  );
  if (!originalRoute) throw new Error(`The ${journey.mode} trip cannot arrive by the appointment at ${journey.arriveBy || 'the chosen time'}. Leave earlier, allow more travel time, or choose a nearer stop.`);

  const scored = await Promise.all(routeCandidates.map(async ({ route, job }) => {
    const routeSamples = sampleRoute(route.geometry.length ? route.geometry : [origin, destination], route.travelMinutes);
    const environmentSamples: RouteEnvironmentSample[] = await Promise.all(routeSamples.map(async (sample) => {
      const sampleTime = shiftTime(job.departureTime, Math.round(sample.elapsedMinutes));
      const environment = await environmentAt(sample.position, input.date, sampleTime, demoMode);
      environmentSources.add(environment.source);
      return { position: sample.position, minutes: sample.minutes, environment };
    }));

    return scoreRoute({
      candidateId: `${journey.tripId}-${route.routeId}-${job.shift}`,
      routeId: route.routeId,
      tripId: journey.tripId,
      mode: route.mode,
      label: route.label + (job.shift ? ` · ${job.shift > 0 ? '+' : ''}${job.shift} min` : ''),
      travelMinutes: route.travelMinutes,
      distanceKm: route.distanceKm,
      geometry: route.geometry,
      source: route.source,
      departureTime: job.departureTime,
      shiftMinutes: job.shift,
      environmentSamples,
    });
  }));

  const deduped = dedupe(scored);
  const original = deduped.find((candidate) =>
    candidate.routeId === originalRoute.route.routeId
    && candidate.mode === journey.mode
    && candidate.shiftMinutes === 0,
  );
  if (!original) throw new Error('Original route was lost during candidate preparation');

  const candidates = deduped
    .filter((candidate) => candidate.candidateId === original.candidateId || isUsefulAlternative(candidate, original))
    .slice(0, 12);

  return {
    set: { journey, candidates, original },
    environmentSources: [...environmentSources],
    routeSources: [...routeSources],
  };
}

function isUsefulAlternative(candidate: RouteCandidate, original: RouteCandidate) {
  if (original.modeledExposure <= 0) return false;
  const gain = (original.modeledExposure - candidate.modeledExposure) / original.modeledExposure;
  if (gain <= 0) return false;
  const noExtraTravel = candidate.travelMinutes <= original.travelMinutes;
  const smallShift = Math.abs(candidate.shiftMinutes) <= 5;
  // Show defensible, measurable improvements even when they are below 2%.
  // A minor positive gain is still useful if it causes no extra travel.
  return gain >= .005 || (noExtraTravel && smallShift);
}

function sampleRoute(geometry: Coordinates[], travelMinutes: number) {
  const points = geometry.length >= 2 ? geometry : [geometry[0], geometry[0]];
  const segmentDistances = points.slice(0, -1).map((point, index) => distanceKm(point, points[index + 1]));
  const totalDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);
  const count = MAX_ENVIRONMENT_SAMPLES;
  const minutes = travelMinutes / count;

  if (!(totalDistance > 0)) {
    return Array.from({ length: count }, (_, index) => ({
      position: points[0],
      minutes,
      elapsedMinutes: minutes * index,
    }));
  }

  return Array.from({ length: count }, (_, index) => {
    const fraction = (index + .5) / count;
    return {
      position: pointAlongRoute(points, segmentDistances, totalDistance * fraction),
      minutes,
      elapsedMinutes: travelMinutes * index / count,
    };
  });
}

function pointAlongRoute(points: Coordinates[], distances: number[], targetDistance: number) {
  let traversed = 0;
  for (let index = 0; index < distances.length; index += 1) {
    const distance = distances[index];
    if (targetDistance <= traversed + distance || index === distances.length - 1) {
      const fraction = distance > 0 ? Math.min(1, Math.max(0, (targetDistance - traversed) / distance)) : 0;
      return {
        lat: points[index].lat + (points[index + 1].lat - points[index].lat) * fraction,
        lon: points[index].lon + (points[index + 1].lon - points[index].lon) * fraction,
      };
    }
    traversed += distance;
  }
  return points[points.length - 1];
}

function isRealisticAlternative(route: BaseRoute) {
  if (route.mode === 'walk') return route.distanceKm <= 8 && route.travelMinutes <= 120;
  if (route.mode === 'bike') return route.distanceKm <= 35 && route.travelMinutes <= 150;
  if (route.mode === 'bus' || route.mode === 'metro') return route.travelMinutes <= 180;
  return route.travelMinutes <= 240;
}

function earliestDepartureForJourney(
  events: AnalyzeDayRequest['events'],
  origin: string,
  destination: string,
  arriveBy?: string,
) {
  if (!arriveBy) {
    // Last trip home still must start after the last appointment at its origin.
    const previous = [...events].filter((event) => samePlace(event.location, origin)).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
    return previous?.end;
  }
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const index = sorted.findIndex((event) => event.start === arriveBy && samePlace(event.location, destination));
  if (index <= 0) return undefined;
  const previous = sorted[index - 1];
  return samePlace(previous.location, origin) ? previous.end : undefined;
}

function samePlace(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function dedupe(items: RouteCandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      item.mode,
      item.travelMinutes,
      item.departureTime,
      item.distanceKm.toFixed(2),
      item.modeledExposure.toFixed(1),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function distanceKm(a: Coordinates, b: Coordinates) {
  const radius = 6371;
  const radians = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * radians;
  const deltaLon = (b.lon - a.lon) * radians;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
