import type { APIGatewayProxyEvent } from 'aws-lambda';
import { sessionUserId } from '../auth';
import { body, json } from '../http';
import { geocode } from '../services/geocode';

/** Return a verified Amazon Location Places V2 point for itinerary map preview. */
export const handler = async (event: APIGatewayProxyEvent) => {
  if (!sessionUserId(event)) return json(401, { message: 'Private session required' });
  try {
    const request = body<{ location?: unknown }>(event.body);
    const location = typeof request?.location === 'string' ? request.location.trim() : '';
    if (location.length < 3 || location.length > 160 || /^home$/i.test(location)) {
      return json(400, { message: 'Enter a place, address, or latitude,longitude to map it' });
    }
    const position = await geocode(location, false);
    return json(200, { location, position, source: 'Amazon Location Places V2' });
  } catch (error) {
    const kind = error instanceof Error ? error.name : 'Unknown';
    console.warn('Place lookup unavailable:', kind);
    return json(422, { message: 'Location not found. Add a more specific place or coordinates.' });
  }
};
