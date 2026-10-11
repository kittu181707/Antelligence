import { minutesToTime, timeToMinutes } from './time';

/** Predictions, not verified arrival guarantees. Never call a late trip feasible. */
export function estimatedLateMinutes(route: { departureTime: string; travelMinutes: number }, arriveBy?: string): number {
  if (!arriveBy) return 0;
  return Math.max(0, timeToMinutes(route.departureTime) + Math.ceil(route.travelMinutes) - timeToMinutes(arriveBy));
}

/** Propose an earlier SAME-DAY departure; respect prior fixed event end times. */
export function earlierDeparture(
  travelMinutes: number,
  currentDeparture: string,
  arriveBy?: string,
  earliestDeparture?: string,
): { departureTime: string; shiftMinutes: number } | null {
  if (!arriveBy || !Number.isFinite(travelMinutes) || travelMinutes <= 0) return null;
  const requested = timeToMinutes(currentDeparture);
  const latest = timeToMinutes(arriveBy) - Math.ceil(travelMinutes);
  if (latest >= requested || latest < 0 ||
      (earliestDeparture && latest < timeToMinutes(earliestDeparture))) return null;
  return { departureTime: minutesToTime(latest), shiftMinutes: latest - requested };
}
