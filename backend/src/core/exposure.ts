import type { EnvironmentSnapshot, RouteCandidate, RouteEnvironmentSample, TransportMode } from '../types';

const EXPOSURE_FACTOR: Record<TransportMode, number> = { car: .62, bike: 1.2, bus: .78, metro: .48, walk: 1 };
const CO2_KG_PER_KM: Record<TransportMode, number> = { car: .171, bike: 0, bus: .082, metro: .035, walk: 0 };

export function outdoorMinutes(mode: TransportMode, travelMinutes: number) {
  if (mode === 'walk' || mode === 'bike') return travelMinutes;
  if (mode === 'metro') return Math.min(12, Math.max(4, travelMinutes * .24));
  if (mode === 'bus') return Math.min(8, Math.max(3, travelMinutes * .12));
  return Math.min(3, travelMinutes * .05);
}

export function scoreRoute(input: {
  candidateId: string;
  routeId: string;
  tripId: string;
  mode: TransportMode;
  label: string;
  travelMinutes: number;
  distanceKm: number;
  geometry: { lat: number; lon: number }[];
  source: string;
  departureTime: string;
  shiftMinutes: number;
  environmentSamples: RouteEnvironmentSample[];
}): RouteCandidate {
  if (!input.environmentSamples.length) throw new Error('Route has no environmental samples');
  if (!Number.isFinite(input.travelMinutes) || input.travelMinutes <= 0 ||
      !Number.isFinite(input.distanceKm) || input.distanceKm < 0) {
    throw new Error('Route has invalid travel time or distance');
  }
  const required = ['pm25', 'pm10', 'aqi', 'temperature', 'humidity', 'windSpeed', 'uvIndex', 'rainProbability'] as const;
  for (const sample of input.environmentSamples) {
    if (!Number.isFinite(sample.minutes) || sample.minutes <= 0 ||
        !Number.isFinite(sample.position.lat) || !Number.isFinite(sample.position.lon) ||
        required.some((name) => !Number.isFinite(sample.environment[name])) ||
        sample.environment.pm25 < 0 || sample.environment.pm10 < 0 || sample.environment.aqi < 0) {
      throw new Error('Route contains invalid environmental measurements');
    }
  }
  const sampledMinutes = input.environmentSamples.reduce((sum, sample) => sum + sample.minutes, 0);
  if (Math.abs(sampledMinutes - input.travelMinutes) > Math.max(0.1, input.travelMinutes * 0.01)) {
    throw new Error('Route environmental samples do not cover the whole journey');
  }

  const outside = outdoorMinutes(input.mode, input.travelMinutes);
  const environment = weightedEnvironment(input.environmentSamples);
  const pollutionExposure = input.environmentSamples.reduce(
    (total, sample) => total + sample.environment.pm25 * sample.minutes * EXPOSURE_FACTOR[input.mode],
    0,
  );

  const highUvFraction = input.environmentSamples.reduce(
    (total, sample) => total + (sample.environment.uvIndex >= 6 ? sample.minutes : 0),
    0,
  ) / Math.max(.001, input.travelMinutes);
  const heatFraction = input.environmentSamples.reduce(
    (total, sample) => total + (sample.environment.temperature >= 32 ? sample.minutes : 0),
    0,
  ) / Math.max(.001, input.travelMinutes);

  const highUvOutdoorMinutes = outside * Math.min(1, highUvFraction);
  const heatRiskOutdoorMinutes = outside * Math.min(1, heatFraction);
  const heatPenalty = heatRiskOutdoorMinutes * Math.max(0, environment.temperature - 31) * 2.2;
  const uvPenalty = highUvOutdoorMinutes * Math.max(0, environment.uvIndex - 5) * 2.6;
  const rainPenalty = environment.rainProbability >= 60 && (input.mode === 'walk' || input.mode === 'bike') ? outside * 1.8 : 0;

  return {
    ...input,
    modeledExposure: round(pollutionExposure + heatPenalty + uvPenalty + rainPenalty),
    pollutionExposure: round(pollutionExposure),
    highUvOutdoorMinutes: round(highUvOutdoorMinutes),
    heatRiskOutdoorMinutes: round(heatRiskOutdoorMinutes),
    estimatedCo2eKg: round(input.distanceKm * CO2_KG_PER_KM[input.mode], 3),
    environment,
  };
}

function weightedEnvironment(samples: RouteEnvironmentSample[]): EnvironmentSnapshot {
  const totalMinutes = samples.reduce((sum, sample) => sum + sample.minutes, 0) || 1;
  const weighted = (pick: (environment: EnvironmentSnapshot) => number) =>
    samples.reduce((sum, sample) => sum + pick(sample.environment) * sample.minutes, 0) / totalMinutes;

  return {
    pm25: round(weighted((environment) => environment.pm25)),
    pm10: round(weighted((environment) => environment.pm10)),
    aqi: round(weighted((environment) => environment.aqi)),
    temperature: round(weighted((environment) => environment.temperature)),
    humidity: round(weighted((environment) => environment.humidity)),
    windSpeed: round(weighted((environment) => environment.windSpeed)),
    uvIndex: round(weighted((environment) => environment.uvIndex)),
    rainProbability: round(weighted((environment) => environment.rainProbability)),
    source: unique(samples.map((sample) => sample.environment.source)).join(' + '),
    updatedAt: samples.map((sample) => sample.environment.updatedAt).filter(Boolean).sort()[0],
    validAt: samples.map((sample) => sample.environment.validAt).filter(Boolean).sort().at(-1),
  };
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function round(value: number, digits = 1) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}
