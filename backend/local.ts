import "dotenv/config";
import express from "express";
import cors from "cors";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler as ics } from "./src/handlers/ics";
import { handler as demo } from "./src/handlers/demo";
import { handler as explain } from "./src/handlers/explain";
import { handler as india } from "./src/handlers/india";
import { handler as environmentCurrent } from "./src/handlers/environment-current";
import { handler as runtimeConfig } from "./src/handlers/runtime-config";
import { handler as resolvePlace } from "./src/handlers/resolve-place";
import { runDirectAnalysis } from "./src/services/analyze";
import { handler as prepare } from "./src/handlers/prepare";
import { matchesSession, sessionUserId } from "./src/auth";
process.env.LOCAL_MODE = "true";
process.env.DEMO_MODE = process.env.DEMO_MODE || "true";
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
const mem = new Map<string, any>();
const event = (req: any) =>
  ({
    body: req.body ? JSON.stringify(req.body) : null,
    queryStringParameters: req.query || null,
    httpMethod: req.method,
    path: req.path,
    headers: req.headers,
  }) as unknown as APIGatewayProxyEvent;
const send = (res: any, r: any) =>
  res
    .status(r.statusCode)
    .set(r.headers || {})
    .send(r.body);
app.get("/api/demo/day", async (req, res) => send(res, await demo()));
app.post("/api/ics/parse", async (req, res) =>
  send(res, await ics(event(req))),
);
app.post("/api/day/analyze", async (req, res) => {
  if (!sessionUserId(event(req))) return res.status(401).json({ message: "Private session required" });
  if (!matchesSession(event(req), req.body?.userId)) return res.status(403).json({ message: "Wrong private session" });
  try {
    const prepared = await prepare(req.body);
    const plan = await runDirectAnalysis(prepared);
    mem.set(plan.planId, plan);
    res.json(plan);
  } catch (e) {
    res
      .status(500)
      .json({ message: e instanceof Error ? e.message : "Analysis failed" });
  }
});
app.post("/api/plan/accept", (req, res) => {
  if (!sessionUserId(event(req))) return res.status(401).json({ message: "Private session required" });
  if (!matchesSession(event(req), req.body?.userId)) return res.status(403).json({ message: "Wrong private session" });
  const plan = mem.get(req.body.planId);
  if (!plan || plan.userId !== req.body.userId) return res.status(404).json({ message: "Plan not found" });
  const key = `history:${req.body.userId}`;
  const existing = (mem.get(key) || []).find((item: any) => item.planId === plan.planId);
  if (existing) return res.json(existing);
  const accepted = { ...plan, acceptedAt: new Date().toISOString() };
  mem.set(key, [accepted, ...(mem.get(key) || [])]);
  if (plan.workflow.dataMode !== 'demo') {
    const g = mem.get("GLOBAL_IMPACT") || { totalPlans: 0, totalCo2eSaved: 0 };
    g.totalPlans++;
    g.totalCo2eSaved += Math.max(0, -Number(plan.metrics?.estimatedCo2eChangeKg || 0));
    mem.set("GLOBAL_IMPACT", g);
  }
  res.json(accepted);
});
app.get("/api/history", (req, res) => {
  if (!sessionUserId(event(req))) return res.status(401).json({ message: "Private session required" });
  if (!matchesSession(event(req), String(req.query.userId || ''))) return res.status(403).json({ message: "Wrong private session" });
  res.json({ plans: mem.get(`history:${req.query.userId}`) || [] });
});
app.get("/api/impact/community", (req, res) =>
  res.json(mem.get("GLOBAL_IMPACT") || { totalPlans: 0, totalCo2eSaved: 0 }),
);
app.post("/api/explain", async (req, res) => {
  const identity = sessionUserId(event(req));
  if (!identity) return res.status(401).json({ message: "Private session required" });
  const plan = mem.get(req.body?.planId);
  if (!plan || plan.userId !== identity) return res.status(404).json({ message: "Plan not found" });
  const change = plan.trips.find((trip: any) => trip.tripId === req.body?.tripId);
  if (!change) return res.status(404).json({ message: "Trip not found" });
  send(res, await explain(event({ ...req, body: { ...req.body, change } })));
});
app.get("/api/india", async (req, res) =>
  send(res, await india()),
);
app.post("/api/environment/current", async (req, res) =>
  send(res, await environmentCurrent(event(req))),
);
app.post("/api/places/resolve", async (req, res) =>
  send(res, await resolvePlace(event(req))),
);
app.get("/api/runtime-config", async (req, res) =>
  send(res, await runtimeConfig(event(req))),
);
app.listen(3001, () => console.log("Local backend on http://localhost:3001"));
setInterval(() => {}, 1000 * 60 * 60);
