import type { APIGatewayProxyResult } from 'aws-lambda';
import { json } from '../http';
import { currentEnvironmentAt, environmentAt } from '../services/environment';

// Representative city-centre model sample points, NOT CPCB monitoring stations.
const CITY_SAMPLES = [
  { name: 'Delhi', lat: 28.6139, lon: 77.2090 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', lat: 17.3850, lon: 78.4867 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Guntur', lat: 16.3067, lon: 80.4365 },
];

export const handler = async (): Promise<APIGatewayProxyResult> => {
  try {
    const demoMode = process.env.DEMO_MODE === 'true';
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hour = now.toISOString().slice(11, 13) + ':00';

    const stations = await Promise.all(CITY_SAMPLES.map(async (station) => {
      try {
        const environment = demoMode
          ? await environmentAt(station, date, hour, true)
          : await currentEnvironmentAt(station);

        return {
          ...station,
          aqi: environment.aqi,
          pm25: environment.pm25,
          pm10: environment.pm10,
          source: environment.source,
          updated: environment.updatedAt || (demoMode ? 'Demo' : 'Unknown'),
          validAt: environment.validAt || null,
          dataType: demoMode ? 'demo' : 'model',
        };
      } catch {
        return {
          ...station,
          aqi: null,
          pm25: null,
          pm10: null,
          source: 'Unavailable',
          updated: 'Unknown',
          validAt: null,
          dataType: 'unavailable',
        };
      }
    }));

    return json(200, { stations, coverage: 'Six city-centre model samples; these coordinates are not CPCB sensor stations.', aqiStandard: 'US EPA' });
  } catch (error) {
    console.error('India live data error:', error);
    return json(500, { message: 'Failed to fetch India data' });
  }
};
