import type { CalendarEvent, DayAnalysis, RouteCandidate, TripCandidateSet } from '../types';

export interface OptimizeSetsInput {
  userId: string;
  date: string;
  events: CalendarEvent[];
  sets: TripCandidateSet[];
  maxExtraMinutes: number;
  environmentSource: string;
  routeSource: string;
  dataMode?: 'demo' | 'live';
}

type State = {
  score: number;
  selected: RouteCandidate[];
  combinations: bigint;
};

export function optimizeCandidateSets(input: OptimizeSetsInput): DayAnalysis {
  if (!input.sets.length) throw new Error('No journeys to optimize');
  const originals = input.sets.map((set) => set.original);
  const originalRaw = sum(originals, 'modeledExposure');

  let states = new Map<number, State>();
  states.set(0, { score: 0, selected: [], combinations: 1n });

  for (let index = 0; index < input.sets.length; index += 1) {
    const set = input.sets[index];
    if (!set.candidates.length) throw new Error(`No candidates for ${set.journey.origin} → ${set.journey.destination}`);
    const next = new Map<number, State>();

    for (const [extraSoFar, state] of states.entries()) {
      for (const candidate of set.candidates) {
        const extra = extraSoFar + Math.max(0, candidate.travelMinutes - set.original.travelMinutes);
        if (extra > input.maxExtraMinutes) continue;

        const score = state.score + candidateScore(candidate, set.original);
        const existing = next.get(extra);
        const combinations = (existing?.combinations || 0n) + state.combinations;

        if (!existing || score < existing.score) {
          next.set(extra, { score, selected: [...state.selected, candidate], combinations });
        } else {
          next.set(extra, { ...existing, combinations });
        }
      }
    }

    if (!next.size) throw new Error('No feasible whole-day plan fits the extra-travel limit');
    states = next;
  }

  let best: State | undefined;
  for (const state of states.values()) {
    if (!best || state.score < best.score) best = state;
  }
  if (!best) throw new Error('No feasible plan');

  let selected = best.selected;
  let optimizedRaw = sum(selected, 'modeledExposure');

  // Do not invent improvements. A sub-0.75% whole-day gain is within
  // modeling noise; clearer alternatives can still be shown as comparisons.
  if (originalRaw > 0 && (originalRaw - optimizedRaw) / originalRaw < 0.0075) {
    selected = originals;
    optimizedRaw = originalRaw;
  }

  const optimizedIndex = originalRaw > 0 ? Math.round((optimizedRaw / originalRaw) * 100) : 100;
  const trips = input.sets.map((set, index) => {
    const recommended = selected[index];
    const changed = recommended.candidateId !== set.original.candidateId;
    return {
      tripId: set.journey.tripId,
      origin: set.journey.origin,
      destination: set.journey.destination,
      original: set.original,
      recommended,
      candidatesEvaluated: set.candidates.length,
      changed,
      explanation: explain(set.original, recommended, set.journey.origin, set.journey.destination),
    };
  });

  const extraTravelMinutes = selected.reduce(
    (total, candidate, index) => total + Math.max(0, candidate.travelMinutes - originals[index].travelMinutes),
    0,
  );
  const feasibleCombinations = [...states.values()].reduce((total, state) => total + state.combinations, 0n);
  const totalCombinations = input.sets.reduce((total, set) => total * BigInt(set.candidates.length), 1n);

  return {
    userId: input.userId,
    planId: `plan-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    date: input.date,
    events: input.events,
    trips,
    changes: trips.filter((trip) => trip.changed),
    metrics: {
      originalExposureIndex: 100,
      optimizedExposureIndex: optimizedIndex,
      exposureReductionPct: Math.max(0, 100 - optimizedIndex),
      originalRawExposure: round(originalRaw),
      optimizedRawExposure: round(optimizedRaw),
      extraTravelMinutes,
      appointmentsChanged: 0,
      originalHighUvMinutes: round(sum(originals, 'highUvOutdoorMinutes')),
      optimizedHighUvMinutes: round(sum(selected, 'highUvOutdoorMinutes')),
      originalHeatRiskMinutes: round(sum(originals, 'heatRiskOutdoorMinutes')),
      optimizedHeatRiskMinutes: round(sum(selected, 'heatRiskOutdoorMinutes')),
      estimatedCo2eChangeKg: round(sum(selected, 'estimatedCo2eKg') - sum(originals, 'estimatedCo2eKg'), 3),
    },
    workflow: {
      routesEvaluated: input.sets.reduce((total, set) => total + set.candidates.length, 0),
      dayPlansTested: safeBigInt(totalCombinations),
      feasiblePlans: safeBigInt(feasibleCombinations),
      environmentSource: input.environmentSource,
      routeSource: input.routeSource,
      environmentalSamples: input.sets.reduce(
        (total, set) => total + set.candidates.reduce((sum, candidate) => sum + candidate.environmentSamples.length, 0),
        0,
      ),
      dataMode: input.dataMode || 'live',
      analysisDurationMs: 0,
    },
  };
}

function candidateScore(candidate: RouteCandidate, original: RouteCandidate) {
  const extra = Math.max(0, candidate.travelMinutes - original.travelMinutes);
  const heatUv = candidate.highUvOutdoorMinutes + candidate.heatRiskOutdoorMinutes;
  const timeShift = Math.abs(candidate.shiftMinutes);
  const changePenalty = candidate.candidateId === original.candidateId ? 0 : 2;
  return candidate.modeledExposure * 1000 + heatUv * 10 + extra + timeShift * 0.1 + changePenalty;
}

function explain(original: RouteCandidate, recommended: RouteCandidate, origin: string, destination: string) {
  if (original.candidateId === recommended.candidateId) {
    return `No change needed for ${origin} to ${destination}; the current trip is the best feasible choice.`;
  }
  const pct = original.modeledExposure > 0
    ? Math.max(0, Math.round((1 - recommended.modeledExposure / original.modeledExposure) * 100))
    : 0;
  const delta = recommended.travelMinutes - original.travelMinutes;
  const parts = [
    `${pct}% lower modeled exposure`,
    `${delta >= 0 ? '+' : ''}${delta} travel min`,
  ];
  if (recommended.shiftMinutes) parts.push(`${recommended.shiftMinutes > 0 ? '+' : ''}${recommended.shiftMinutes} min departure shift`);
  if (recommended.source.startsWith('Planning estimate')) {
    parts.push('planning estimate only; this is not a verified navigable route or transit service');
  }
  return `${recommended.label}: ${parts.join(' · ')}.`;
}

function sum(items: RouteCandidate[], key: keyof RouteCandidate) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function safeBigInt(value: bigint) {
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

function round(value: number, digits = 1) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}
