import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartSyncExecutionCommand } from '@aws-sdk/client-sfn';
import type { AnalyzeDayRequest } from '../types';
import { body, json } from '../http';
import { sessionUserId } from '../auth';
import { handler as prepare } from './prepare';
import { runDirectAnalysis } from '../services/analyze';
import { persistDraft } from '../services/persistence';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const userId = sessionUserId(event);
  if (!userId) return json(401, { message: 'Private session required' });
  try {
    const input = body<AnalyzeDayRequest>(event.body);
    if (!input || input.userId !== userId) return json(403, { message: 'Session does not match user' });
    const prepared = await prepare(input);
    if (process.env.LOCAL_MODE === 'true' || !process.env.WORKFLOW_ARN) {
      const plan = await runDirectAnalysis(prepared);
      await persistDraft(plan);
      return json(200, plan);
    }
    const sfn = new SFNClient({});
    const result = await sfn.send(new StartSyncExecutionCommand({
      stateMachineArn: process.env.WORKFLOW_ARN,
      input: JSON.stringify(prepared),
      name: `analysis-${Date.now()}`,
    }));
    if (result.status !== 'SUCCEEDED') throw new Error(workflowFailureReason(result.error, result.cause));
    const plan = JSON.parse(result.output || '{}');
    if (!plan.planId || !Array.isArray(plan.trips)) throw new Error('Optimizer returned no usable route plan. Please try again.');
    return json(200, plan);
  } catch (error) {
    console.error(error);
    return json(422, { message: error instanceof Error ? error.message : 'Analysis failed' });
  }
};

/** Express workflows return opaque error codes with details nested in Cause. */
export function workflowFailureReason(code?: string, cause?: string) {
  let description = '';
  try {
    const parsed: unknown = cause ? JSON.parse(cause) : null;
    if (parsed && typeof parsed === 'object') {
      const item = parsed as Record<string, unknown>;
      const deeper = typeof item.Cause === 'string' ? item.Cause : '';
      if (deeper) {
        try {
          const inner = JSON.parse(deeper) as Record<string, unknown>;
          description = String(inner.errorMessage || inner.message || deeper);
        } catch { description = deeper; }
      } else {
        description = String(item.errorMessage || item.message || item.Error || '');
      }
    }
  } catch {
    description = String(cause || '');
  }
  const value = (description || code || '').slice(0, 1200);
  // Never copy internal request payloads, AWS JSON or stack traces to users.
  if (/live (bus|metro) routing is unavailable|no live (bus|metro) route/i.test(value))
    return 'Amazon Location could not find a live bus or metro route here. Switch those journeys to Car or Walk and retry.';
  if (/amazon location could not validate|validationexception|routesvalidationexception/i.test(value))
    return 'Amazon Location rejected a live route. Check the location and departure time; if using Bus or Metro, switch to Car or Walk.';
  if (/environmental|forecast|open-meteo|tomorrow\.io/i.test(value))
    return 'Environmental forecast data is unavailable for that day. Try another date or retry in a few minutes.';
  if (/timed_out|timeout|timed out/i.test(value))
    return 'Live analysis took too long. Reduce the number of stops and try Car or Walk.';
  if (/original .*cannot arrive|no feasible|overlaps|must end after/i.test(value))
    return 'One of these routes cannot meet its scheduled appointment. Adjust departure or stop times and retry.';
  return 'Live route analysis could not finish. Check your destinations and try Car or Walk; the demo is unaffected.';
}
