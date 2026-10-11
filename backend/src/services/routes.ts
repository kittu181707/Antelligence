import type { BaseRoute, Coordinates, TransportMode } from '../types';

let clientPromise: Promise<any> | null = null;

async function client() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-geo-routes').then(({ GeoRoutesClient }) => new GeoRoutesClient({}));
  }
  return clientPromise;
}

/**
 * Use a genuine AWS route when available. Missing transit coverage and
 * temporary routing failures fall back to a road-corridor estimate, then to
 * a straight-line planning sketch. Estimates are NOT schedules, navigable
 * directions, or proof of safe/cycle-legal/pedestrian-legal access.
 */
export async function routesForTrip(input: {
  origin: Coordinates;
  destination: Coordinates;
  mode: TransportMode;
  date: string;
  departureTime: string;
  arriveBy?: string;
  demoMode: boolean;
  tripOrdinal: number;
}, requestOverride?: (command: any) => Promise<any>): Promise<BaseRoute[]> {
  if (input.demoMode) return demoRoutes(input);

  if (!validCoordinate(input.origin) || !validCoordinate(input.destination)) {
    throw new Error('Invalid route coordinates; check the starting point and destination.');
  }
  const { CalculateRoutesCommand } = await import('@aws-sdk/client-geo-routes');
  // Optional injected transport keeps real fallback behavior testable offline.
  const aws = requestOverride ? null : await client();
  // AWS has no bicycle mode. Its car-road geometry is a distance proxy,
  // not bicycle-safe or bicycle-legal navigation.
  const travelMode = input.mode === 'walk' ? 'Pedestrian' : (input.mode === 'bus' || input.mode === 'metro') ? 'Transit' : 'Car';
  const base: any = {
    Origin: [input.origin.lon, input.origin.lat],
    Destination: [input.destination.lon, input.destination.lat],
    MaxAlternatives: 1,
    LegGeometryFormat: 'Simple',
    LegAdditionalFeatures: ['Summary'],
    ...(futureDeparture(input.date, input.departureTime) ? { DepartureTime: departureIso(input.date, input.departureTime) } : {}),
  };
  const request = async (mode: string): Promise<any[]> => {
    const command: any = { ...base, TravelMode: mode };
    if (mode === 'Transit') {
      command.TravelModeOptions = {
        Transit: { AllowedModes: input.mode === 'bus'
          ? ['Bus', 'BusRapidTransit', 'PrivateBus']
          : ['Subway', 'CityTrain', 'LightRail', 'Monorail'] },
      };
    }
    try {
      const result: any = requestOverride
        ? await requestOverride(command)
        : await aws!.send(new CalculateRoutesCommand(command));
      return result.Routes || [];
    } catch (error: any) {
      const diagnostic = [error?.message, error?.Reason, error?.reason].filter(Boolean).join(' ');
      // Reuse a current network route if an appointment's departure timestamp
      // is rejected by AWS, rather than treating it as a nonexistent road.
      if ((error?.name === 'ValidationException' || error?.name === 'RoutesValidationException') &&
          /departure|time/i.test(diagnostic) && command.DepartureTime) {
        delete command.DepartureTime;
        const result: any = requestOverride
          ? await requestOverride(command)
          : await aws!.send(new CalculateRoutesCommand(command));
        return result.Routes || [];
      }
      throw error;
    }
  };

  try {
    const routes = await request(travelMode);
    const parsed = routes.slice(0, 2).map((route, index): BaseRoute => {
      const distanceMeters = Number(route.Summary?.Distance);
      const duration = Number(route.Summary?.Duration);
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0 ||
          !Number.isFinite(duration) || duration <= 0) throw new Error('Incomplete AWS route');
      const points: Coordinates[] = (route.Legs || []).flatMap((leg: any) =>
        (leg.Geometry?.LineString || []).map((point: number[]) => ({ lon: point[0], lat: point[1] })),
      );
      const bikeEstimate = input.mode === 'bike';
      return {
        routeId: `aws-${input.mode}-${index}`,
        mode: input.mode,
        label: bikeEstimate ? 'Bike · travel-time estimate' : index ? `${label(input.mode)} · alternate` : label(input.mode),
        travelMinutes: bikeEstimate ? estimatedBikeMinutes(distanceMeters) : Math.max(1, Math.round(duration / 60)),
        distanceKm: Math.max(0.1, distanceMeters / 1000),
        geometry: points.length >= 2 && points.every(validCoordinate) ? points : [input.origin, input.destination],
        source: bikeEstimate
          ? 'Amazon Location Routes V2 car-road geometry · estimated cycling time (not bicycle-verified)'
          : 'Amazon Location Routes V2',
      };
    });
    if (parsed.length) return parsed;
  } catch (error) {
    console.warn(`AWS ${input.mode} route unavailable; trying an estimated fallback:`, error);
  }

  // A road-network corridor still helps approximate length when the requested
  // transit/pedestrian mode lacks coverage. It is NOT that mode's itinerary.
  if (travelMode !== 'Car') {
    try {
      const road = await request('Car');
      const valid = road.find((route: any) =>
        Number.isFinite(Number(route.Summary?.Distance)) && Number(route.Summary?.Distance) > 0);
      if (valid) {
        const geometry: Coordinates[] = (valid.Legs || []).flatMap((leg: any) =>
          (leg.Geometry?.LineString || []).map((point: number[]) => ({ lon: point[0], lat: point[1] })),
        );
        return [planningEstimate(input, Math.max(.1, Number(valid.Summary.Distance) / 1000),
          geometry.length >= 2 && geometry.every(validCoordinate) ? geometry : [input.origin, input.destination],
          'road')];
      }
    } catch (error) {
      console.warn('Road-corridor fallback unavailable; using straight-line planning estimate:', error);
    }
  }

  // Last resort: a planning sketch, not a claim that transport service exists.
  const directKm = haversine(input.origin, input.destination);
  return [planningEstimate(input, Math.max(.1, directKm * 1.3), [input.origin, input.destination], 'straight')];
}

function validCoordinate(point: Coordinates): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}

/** Exported for deterministic, no-AWS fallback regression testing. */
export function planningEstimate(
  input: { origin: Coordinates; destination: Coordinates; mode: TransportMode },
  distanceKm: number,
  geometry: Coordinates[],
  basis: 'road' | 'straight',
): BaseRoute {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 ||
      geometry.length < 2 || !geometry.every(validCoordinate)) {
    throw new Error('Invalid fallback distance or geometry');
  }
  const speed: Record<TransportMode, number> = { car: 27, bike: 14, bus: 20, metro: 28, walk: 4.5 };
  // Not actual transport schedules: approximate waiting, boarding and access.
  const accessMinutes: Record<TransportMode, number> = { car: 2, bike: 3, bus: 12, metro: 17, walk: 0 };
  const travelMinutes = Math.max(1, Math.ceil(distanceKm / speed[input.mode] * 60 * (input.mode === 'bike' ? 1.15 : 1.1) + accessMinutes[input.mode]));
  const description = basis === 'road' ? 'AWS car-road corridor proxy' : 'straight-line guide';
  const caution = input.mode === 'bus' || input.mode === 'metro'
    ? 'no verified transit service, stops or timetable'
    : input.mode === 'bike' ? 'cycling access and safety not verified'
    : input.mode === 'walk' ? 'pedestrian access not verified'
    : 'road connectivity and traffic not verified';
  return {
    routeId: `estimate-${basis}-${input.mode}`,
    mode: input.mode,
    label: `${label(input.mode)} · estimate only`,
    travelMinutes,
    distanceKm: Math.round(distanceKm * 100) / 100,
    geometry,
    source: `Planning estimate · ${description} · ${caution} · not navigable directions`,
  };
}

/** Planning estimate only: 14 km/h with 15% allowance for junctions/stops.
 * Cycling access, gradient, traffic and bike safety are NOT certified by AWS. */
export function estimatedBikeMinutes(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error('Invalid distance for bike estimate');
  }
  return Math.max(1, Math.ceil((distanceMeters / 1000 / 14) * 60 * 1.15));
}

export function futureDeparture(date: string, time: string, now = Date.now()) {
  const requested = Date.parse(departureIso(date, time));
  return Number.isFinite(requested) && requested > now + 120_000;
}

export function userFacingRoutingError(error: unknown, mode: TransportMode): Error {
  const name = error instanceof Error ? error.name : 'Unknown';
  if (name === 'ValidationException' || name === 'RoutesValidationException') {
    return new Error(mode === 'bus' || mode === 'metro'
      ? `Live ${mode === 'bus' ? 'bus' : 'metro'} routing is unavailable for this journey. Amazon Location did not return a valid transit route. Choose Car or Walk and try again.`
      : 'Amazon Location could not validate this route. Check both locations and try Car or Walk.');
  }
  if (name === 'ThrottlingException') return new Error('Live routes are busy. Wait a moment and retry.');
  if (name === 'ResourceNotFoundException') return new Error('Routing is not available for these locations.');
  return error instanceof Error && error.message ? error : new Error('Route service temporarily unavailable. Please retry.');
}

function departureIso(date: string, time: string) {
  const offset = process.env.APP_TIMEZONE_OFFSET || '+05:30';
  if (offset !== 'Z' && !/^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(offset)) throw new Error('Invalid APP_TIMEZONE_OFFSET');
  return `${date}T${time}:00${offset}`;
}

function demoRoutes(input: {
  origin: Coordinates;
  destination: Coordinates;
  mode: TransportMode;
  departureTime: string;
  tripOrdinal: number;
}) {
  const baseDistance = Math.max(2, haversine(input.origin, input.destination) * 1.18);
  const speeds: Record<TransportMode, number> = { car: 28, bike: 15, bus: 23, metro: 31, walk: 4.8 };
  const modifiers: Record<TransportMode, number> = { car: 1, bike: 1.08, bus: 1.12, metro: 1.15, walk: 1.02 };
  let minutes = Math.round(baseDistance * modifiers[input.mode] / speeds[input.mode] * 60);
  if (input.mode === 'metro') minutes += 7;
  if (input.mode === 'bus') minutes += 6;
  if (input.tripOrdinal === 2 && input.mode === 'car') minutes += 9;
  if (input.tripOrdinal === 3 && input.mode === 'car') minutes += 14;

  const base = {
    routeId: `demo-${input.mode}-0`,
    mode: input.mode,
    label: label(input.mode),
    travelMinutes: minutes,
    distanceKm: round(baseDistance * modifiers[input.mode]),
    geometry: bend(input.origin, input.destination, input.mode === 'car' ? 0.015 : -0.01),
    source: 'Controlled demo route data',
  };

  return input.mode === 'car'
    ? [base, {
      ...base,
      routeId: `demo-${input.mode}-1`,
      label: 'Car · alternate road',
      travelMinutes: minutes + 5,
      distanceKm: round(base.distanceKm * 1.08),
      geometry: bend(input.origin, input.destination, -0.02),
    }]
    : [base];
}

function label(mode: TransportMode) {
  return ({ car: 'Car', bike: 'Bike', bus: 'Bus', metro: 'Metro + walk', walk: 'Walk' } as Record<TransportMode, string>)[mode];
}

function haversine(a: Coordinates, b: Coordinates) {
  const radius = 6371;
  const radians = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * radians;
  const deltaLon = (b.lon - a.lon) * radians;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bend(a: Coordinates, b: Coordinates, offset: number) {
  return [a, { lat: (a.lat + b.lat) / 2 + offset, lon: (a.lon + b.lon) / 2 - offset }, b];
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
