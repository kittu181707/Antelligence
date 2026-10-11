export type TransportMode = 'car' | 'bike' | 'bus' | 'metro' | 'walk';
export interface CalendarEvent { eventId:string; title:string; location:string; start:string; end:string; fixed:boolean }
export interface JourneyInput { tripId:string; origin:string; destination:string; departureTime:string; arriveBy?:string; mode:TransportMode }
export interface AgendaPayload { date:string; homeLocation:string; events:CalendarEvent[] }
export interface AnalyzeDayRequest extends AgendaPayload { userId:string; journeys:JourneyInput[]; maxExtraMinutes:number; demoMode?:boolean }
export interface Coordinates { lat:number; lon:number }
export interface EnvironmentSnapshot { pm25:number; pm10:number; aqi:number; temperature:number; humidity:number; windSpeed:number; uvIndex:number; rainProbability:number; source:string; updatedAt?:string; validAt?:string }
export interface RouteEnvironmentSample { position:Coordinates; minutes:number; environment:EnvironmentSnapshot }
export interface RouteCandidate { candidateId:string; tripId:string; mode:TransportMode; label:string; departureTime:string; shiftMinutes:number; travelMinutes:number; distanceKm:number; modeledExposure:number; pollutionExposure:number; highUvOutdoorMinutes:number; heatRiskOutdoorMinutes:number; estimatedCo2eKg:number; environment:EnvironmentSnapshot; environmentSamples:RouteEnvironmentSample[]; geometry:Coordinates[]; source:string }
export interface TripAnalysis { tripId:string; origin:string; destination:string; arriveBy?:string; original:RouteCandidate; recommended:RouteCandidate; candidatesEvaluated:number; changed:boolean; explanation:string }
export interface AnalysisMetrics { originalExposureIndex:number; optimizedExposureIndex:number; exposureReductionPct:number; originalRawExposure:number; optimizedRawExposure:number; extraTravelMinutes:number; appointmentsChanged:number; originalHighUvMinutes:number; optimizedHighUvMinutes:number; originalHeatRiskMinutes:number; optimizedHeatRiskMinutes:number; estimatedCo2eChangeKg:number }
export interface DayAnalysis { userId:string; planId:string; createdAt:string; date:string; events:CalendarEvent[]; trips:TripAnalysis[]; metrics:AnalysisMetrics; changes:TripAnalysis[]; workflow:{ routesEvaluated:number; dayPlansTested:number; feasiblePlans:number; environmentSource:string; routeSource:string; environmentalSamples:number; dataMode:'demo'|'live'; analysisDurationMs:number } }
export interface AcceptedPlan extends DayAnalysis { acceptedAt:string }
export interface RuntimeConfig { region:string; mapStyle:string; mapApiKey:string|null; source:string }
