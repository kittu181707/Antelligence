import type { Coordinates } from '../types';
import { DEMO_COORDS } from '../core/demo';

const cache = new Map<string, Coordinates>();
let clientPromise: Promise<any> | null = null;

async function client() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-geo-places').then(({ GeoPlacesClient }) => new GeoPlacesClient({}));
  }
  return clientPromise;
}

export async function geocode(location: string, demoMode: boolean): Promise<Coordinates> {
  const query = location.trim();
  if (!query) throw new Error('Location is required');
  if (query.length > 200) throw new Error('Location is too long');
  // The browser's live GPS origin is passed as a lat,lon pair; it needs no paid geocoding call.
  const match = query.match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (match) {
    const lat = Number(match[1]), lon = Number(match[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
    throw new Error('Coordinates are out of range');
  }
  if (demoMode && DEMO_COORDS[query]) return DEMO_COORDS[query];

  // Common local station/city shorthand, normalized before searching AWS Places.
  // We never fabricate coordinates for arbitrary unresolved user text.
  const aliases: Record<string, string> = {
    gnt: 'Guntur, Andhra Pradesh, India',
    vij: 'Vijayawada, Andhra Pradesh, India',
  };
  const lookup = aliases[query.toLowerCase()] || query;
  const key = lookup.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const { GeocodeCommand } = await import('@aws-sdk/client-geo-places');
  let position: number[] | undefined;
  for (const candidate of [lookup, ...(lookup.includes(',') ? [] : [lookup + ', India'])]) {
    try {
      const response: any = await (await client()).send(new GeocodeCommand({ QueryText: candidate, MaxResults: 1 }));
      const coordinates = response.ResultItems?.[0]?.Position;
      if (Array.isArray(coordinates) && coordinates.length >= 2 &&
          Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
        position = coordinates;
        break;
      }
    } catch (error) {
      if (candidate.endsWith(', India')) throw error;
    }
  }
  if (!position) throw new Error(`Could not find "${query}". Enter a city or full address, or use latitude,longitude.`);

  const result = { lon: Number(position[0]), lat: Number(position[1]) };
  cache.set(key, result);
  return result;
}
