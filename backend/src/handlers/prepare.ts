import type { AnalyzeDayRequest, PreparedRequest, TransportMode } from '../types';
import { isValidDate, isValidTime, timeToMinutes, checkForecastDate } from '../core/time';

const MODES = new Set<TransportMode>(['car', 'bike', 'bus', 'metro', 'walk']);
const MAX_EVENTS = 12;
const MAX_JOURNEYS = 13;

function clean(value: unknown, field: string, max = 200) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${field} is too long`);
  return result;
}

function samePlace(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const handler = async (input: AnalyzeDayRequest): Promise<PreparedRequest> => {
  if (!input || typeof input !== 'object') throw new Error('Invalid analysis request');
  if (!isValidDate(input.date)) throw new Error('Invalid day date');
  if (!input.demoMode) {
    const warning = checkForecastDate(input.date);
    if (warning) throw new Error(warning);
  }
  const userId = clean(input.userId, 'User ID', 128);
  const homeLocation = clean(input.homeLocation, 'Home location');

  if (!Array.isArray(input.events) || input.events.length < 1) throw new Error('At least one event is required');
  if (input.events.length > MAX_EVENTS) throw new Error(`A maximum of ${MAX_EVENTS} events is supported per day`);
  if (!Array.isArray(input.journeys) || input.journeys.length < 1) throw new Error('At least one journey is required');
  if (input.journeys.length > MAX_JOURNEYS) throw new Error(`A maximum of ${MAX_JOURNEYS} journeys is supported per day`);
  if (!Number.isInteger(input.maxExtraMinutes) || input.maxExtraMinutes < 0 || input.maxExtraMinutes > 120) throw new Error('Invalid maximum extra travel');

  const eventIds = new Set<string>();
  const events = [...input.events].map((event) => {
    const eventId = clean(event.eventId, 'Event ID', 128);
    if (eventIds.has(eventId)) throw new Error('Event IDs must be unique');
    eventIds.add(eventId);
    const title = clean(event.title, 'Event title', 160);
    const location = clean(event.location, 'Event location');
    if (!isValidTime(event.start) || !isValidTime(event.end)) throw new Error(`Invalid time for ${title}`);
    if (timeToMinutes(event.end) <= timeToMinutes(event.start)) throw new Error(`${title} must end after it starts`);
    return { ...event, eventId, title, location };
  }).sort((a, b) => a.start.localeCompare(b.start));

  for (let i = 1; i < events.length; i += 1) {
    if (timeToMinutes(events[i].start) < timeToMinutes(events[i - 1].end)) {
      throw new Error(`${events[i].title} overlaps ${events[i - 1].title}`);
    }
  }

  const tripIds = new Set<string>();
  const journeys = input.journeys.map((journey) => {
    const tripId = clean(journey.tripId, 'Trip ID', 128);
    if (tripIds.has(tripId)) throw new Error('Trip IDs must be unique');
    tripIds.add(tripId);
    const origin = clean(journey.origin, 'Journey origin');
    const destination = clean(journey.destination, 'Journey destination');
    if (samePlace(origin, destination)) throw new Error('Journey origin and destination must differ');
    if (!MODES.has(journey.mode)) throw new Error('Unsupported transport mode');
    if (!isValidTime(journey.departureTime)) throw new Error('Invalid journey departure time');

    if (journey.arriveBy) {
      if (!isValidTime(journey.arriveBy)) throw new Error('Invalid arrival time');
      if (timeToMinutes(journey.departureTime) >= timeToMinutes(journey.arriveBy)) throw new Error('Journey must depart before its appointment');
      const destinationIndex = events.findIndex((event) => event.start === journey.arriveBy && samePlace(event.location, destination));
      if (destinationIndex < 0) throw new Error('Journey arrival does not match a calendar event');
      const previous = destinationIndex > 0 ? events[destinationIndex - 1] : undefined;
      if (previous && samePlace(previous.location, origin) && timeToMinutes(journey.departureTime) < timeToMinutes(previous.end)) {
        throw new Error(`Journey from ${origin} leaves before ${previous.title} ends`);
      }
    }

    return { ...journey, tripId, origin, destination };
  });

  if (journeys.length > events.length + 1) throw new Error('Too many journeys for the supplied agenda');

  return { ...input, userId, homeLocation, events, journeys, preparedAt: new Date().toISOString() };
};
