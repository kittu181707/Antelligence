import type { BaseRoute, Coordinates, TransportMode } from '../types';

let clientPromise: Promise<any> | null = null;

async function client() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-geo-routes').then(({ GeoRoutesClient }) => new GeoRoutesClient({}));
  }
  return clientPromise;
}

export async function routesForTrip(input: {
  origin: Coordinates;
  destination: Coordinates;
  mode: TransportMode;
  date: string;
  departureTime: string;
  arriveBy?: string;
  demoMode: boolean;
  tripOrdinal: number;
}): Promise<BaseRoute[]> {
  if (input.demoMode) return demoRoutes(input);

  const { CalculateRoutesCommand } = await import('@aws-sdk/client-geo-routes');
  const travelMode = input.mode === 'walk' || input.mode === 'bike' ? 'Pedestrian' : (input.mode === 'bus' || input.mode === 'metro') ? 'Transit' : 'Car';

  const command: any = {
    Origin: [input.origin.lon, input.origin.lat],
    Destination: [input.destination.lon, input.destination.lat],
    TravelMode: travelMode,
    MaxAlternatives: 1,
    LegGeometryFormat: 'Simple',
    LegAdditionalFeatures: ['Summary'],
    // AWS rejects historical departure times. For a past appointment use a
    // current road-network route instead of sending an invalid timestamp.
    ...(futureDeparture(input.date, input.departureTime) ? { DepartureTime: departureIso(input.date, input.departureTime) } : {}),
  };

  if (travelMode === 'Transit') {
    command.TravelModeOptions = {
      Transit: {
        AllowedModes: input.mode === 'bus'
          ? ['Bus', 'BusRapidTransit', 'PrivateBus']
          : ['Subway', 'CityTrain', 'LightRail', 'Monorail'],
      },
    };
  }

  let response: any;
  try {
    response = await (await client()).send(new CalculateRoutesCommand(command));
  } catch (error: any) {
    // Some providers report departure-time validation in a terse 'Reason'
    // field instead of message. Retry without historical traffic prediction.
    const diagnostic = [error?.message, error?.Reason, error?.reason].filter(Boolean).join(' ');
    if (error?.name === 'ValidationException' && /departure|time/i.test(diagnostic) && command.DepartureTime) {
      delete command.DepartureTime;
      try {
        response = await (await client()).send(new CalculateRoutesCommand(command));
      } catch (retryError) {
        throw userFacingRoutingError(retryError, input.mode);
      }
    } else {
      throw userFacingRoutingError(error, input.mode);
    }
  }
  const routes: any[] = response.Routes || [];
  if (!routes.length) throw new Error(`No live ${input.mode} route was found. Try Car or Walk, or use a more specific destination.`);

  return routes.slice(0, 2).map((route, index) => {
    const durationSeconds = Number(route.Summary?.Duration);
    const distanceMeters = Number(route.Summary?.Distance);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(distanceMeters) || distanceMeters < 0) {
      throw new Error('Amazon Location returned an incomplete route summary');
    }

    const geometry = (route.Legs || []).flatMap((leg: any) =>
      (leg.Geometry?.LineString || []).map((point: number[]) => ({ lon: point[0], lat: point[1] })),
    );

    const bikeEstimate = input.mode === 'bike';
    return {
      routeId: `aws-${input.mode}-${index}`,
      mode: input.mode,
      label: bikeEstimate ? 'Bike · travel-time estimate' : index ? `${label(input.mode)} · alternate` : label(input.mode),
      travelMinutes: bikeEstimate ? estimatedBikeMinutes(distanceMeters) : Math.max(1, Math.round(durationSeconds / 60)),
      distanceKm: Math.max(0.1, distanceMeters / 1000),
      geometry: geometry.length ? geometry : [input.origin, input.destination],
      // AWS Routes V2 has no Bicycle mode. These coordinates are pedestrian
      // routing geometry, not evidence that each segment is cycling-legal.
      source: bikeEstimate
        ? 'Amazon Location Routes V2 pedestrian geometry · estimated cycling time (not bicycle-verified)'
        : 'Amazon Location Routes V2',
    };
  });
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
