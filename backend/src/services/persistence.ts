import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DayAnalysis } from '../types';

const table = () => process.env.TABLE_NAME || 'ai-pollution-optimizer-plans';
let documentClient: DynamoDBDocumentClient | undefined;

function doc() {
  if (!documentClient) documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return documentClient;
}

export async function persistDraft(plan: DayAnalysis) {
  if (process.env.LOCAL_MODE === 'true') return plan;
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  await doc().send(new PutCommand({
    TableName: table(),
    Item: {
      pk: `PLAN#${plan.planId}`,
      sk: 'PLAN',
      userId: plan.userId,
      status: 'analyzed',
      createdAt: plan.createdAt,
      expiresAt,
      plan,
    },
  }));
  return plan;
}

export async function getPlan(planId: string) {
  const result = await doc().send(new GetCommand({
    TableName: table(),
    Key: { pk: `PLAN#${planId}`, sk: 'PLAN' },
    ConsistentRead: true,
  }));
  return result.Item as { userId?: string; plan?: DayAnalysis } | undefined;
}

export async function acceptPlan(userId: string, planId: string) {
  if (process.env.LOCAL_MODE === 'true') throw new Error('LOCAL_ACCEPT');
  const draft = await getPlan(planId);
  if (!draft?.plan) throw new Error('Plan not found');
  if (draft.userId !== userId || draft.plan.userId !== userId) throw new Error('Plan does not belong to this user');

  // Deterministic sort key makes concurrent and repeated accepts idempotent.
  const key = { pk: `USER#${userId}`, sk: `PLAN#${draft.plan.createdAt}#${planId}` };
  const existing = await doc().send(new GetCommand({ TableName: table(), Key: key }));
  if (existing.Item?.plan) return existing.Item.plan as DayAnalysis & { acceptedAt: string };

  const acceptedAt = new Date().toISOString();
  const plan = { ...draft.plan, acceptedAt };
  const co2eSaved = Math.max(0, -Number(plan.metrics?.estimatedCo2eChangeKg || 0));
  const actions: any[] = [{
    Put: {
      TableName: table(),
      Item: { ...key, planId, acceptedAt, plan },
      ConditionExpression: 'attribute_not_exists(pk)',
    },
  }];
  // Demo plans may be saved, but never contribute to real impact statistics.
  if (plan.workflow.dataMode !== 'demo') {
    actions.push({
      Update: {
        TableName: table(),
        Key: { pk: 'GLOBAL', sk: 'IMPACT' },
    ConsistentRead: true,
        UpdateExpression: 'ADD totalPlans :one, totalCo2eSaved :co2e',
        ExpressionAttributeValues: { ':one': 1, ':co2e': co2eSaved },
      },
    });
  }
  try {
    await doc().send(new TransactWriteCommand({ TransactItems: actions }));
  } catch (error) {
    // A concurrent winner already accepted this plan; return that saved copy.
    const previous = await doc().send(new GetCommand({ TableName: table(), Key: key, ConsistentRead: true }));
    if (previous.Item?.plan) return previous.Item.plan as DayAnalysis & { acceptedAt: string };
    throw error;
  }
  return plan;
}

export async function history(userId: string) {
  if (process.env.LOCAL_MODE === 'true') return [];
  const result = await doc().send(new QueryCommand({
    TableName: table(),
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `USER#${userId}` },
    ScanIndexForward: false,
    Limit: 20,
    ConsistentRead: true,
  }));
  return (result.Items || []).map((item) => item.plan);
}

export async function communityImpact() {
  if (process.env.LOCAL_MODE === 'true') return { totalPlans: 0, totalCo2eSaved: 0 };
  const result = await doc().send(new GetCommand({
    TableName: table(),
    Key: { pk: 'GLOBAL', sk: 'IMPACT' },
  }));
  return {
    totalPlans: result.Item?.totalPlans || 0,
    totalCo2eSaved: result.Item?.totalCo2eSaved || 0,
  };
}
