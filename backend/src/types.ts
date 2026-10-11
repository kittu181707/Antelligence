export type TransportMode = 'car' | 'bike' | 'bus' | 'metro' | 'walk';

export interface CalendarEvent {
  eventId: string;
  title: string;
  location: string;
  start: string;
  end: string;
  fixed: boolean;
}

export interface JourneyInput {
  tripId: string;
  origin: string;
  destination: string;
  departureTime: string;
  arriveBy?: string;
  mode: TransportMode;
}

export interface AnalyzeDayRequest {
  userId: string;
  date: string;
  homeLocation: string;
  events: CalendarEvent[];
  journeys: JourneyInput[];
  maxExtraMinutes: number;
  demoMode?: boolean;
}

export interface Coordinates { lat: number; lon: number }

export interface EnvironmentSnapshot {
  pm25: number;
  pm10: number;
  aqi: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  rainProbability: number;
  source: string;
  updatedAt?: string;
  validAt?: string;
}

export interface RouteEnvironmentSample {
  position: Coordinates;
  minutes: number;
  environment: EnvironmentSnapshot;
}

export interface BaseRoute {
  routeId: string;
  mode: TransportMode;
  label: string;
  travelMinutes: number;
  distanceKm: number;
  geometry: Coordinates[];
  source: string;
}

export interface RouteCandidate extends BaseRoute {
  candidateId: string;
  tripId: string;
  departureTime: string;
  shiftMinutes: number;
  modeledExposure: number;
  pollutionExposure: number;
  highUvOutdoorMinutes: number;
  heatRiskOutdoorMinutes: number;
  estimatedCo2eKg: number;
  environment: EnvironmentSnapshot;
  environmentSamples: RouteEnvironmentSample[];
}

export interface TripCandidateSet {
  journey: JourneyInput;
  candidates: RouteCandidate[];
  original: RouteCandidate;
}

export interface TripAnalysis {
  tripId: string;
  origin: string;
  destination: string;
  arriveBy?: string;
  original: RouteCandidate;
  recommended: RouteCandidate;
  candidatesEvaluated: number;
  changed: boolean;
  explanation: string;
}

export interface AnalysisMetrics {
  originalExposureIndex: number;
  optimizedExposureIndex: number;
  exposureReductionPct: number;
  originalRawExposure: number;
  optimizedRawExposure: number;
  extraTravelMinutes: number;
  appointmentsChanged: number;
  originalHighUvMinutes: number;
  optimizedHighUvMinutes: number;
  originalHeatRiskMinutes: number;
  optimizedHeatRiskMinutes: number;
  estimatedCo2eChangeKg: number;
}

export interface DayAnalysis {
  userId: string;
  planId: string;
  createdAt: string;
  date: string;
  events: CalendarEvent[];
  trips: TripAnalysis[];
  metrics: AnalysisMetrics;
  changes: TripAnalysis[];
  workflow: {
    routesEvaluated: number;
    dayPlansTested: number;
    feasiblePlans: number;
    environmentSource: string;
    routeSource: string;
    environmentalSamples: number;
    dataMode: 'demo' | 'live';
    analysisDurationMs: number;
  };
}

export interface PreparedRequest extends AnalyzeDayRequest { preparedAt: string }
