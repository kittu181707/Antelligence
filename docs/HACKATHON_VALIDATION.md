# Environmental Hacks — Implementation and Validation Report

**Event:** WeMakeDevs Environmental Hacks, Air track, October 8–11, 2026  
**Repository:** https://github.com/kittu181707/pollution  
**Production UI:** https://main.d22y9q2ay7ukew.amplifyapp.com/  
**Scope:** Code-path forensics, targeted vulnerability/correctness fixes, stress-test additions, AWS deploy observability and verifiable demo workflow. Not a claim that every live geography and provider has been tested.

## 1. What the judges actually require

The official Air-track page scores problem impact, meaningful AWS use, design/usability, **working execution**, and a **video up to three minutes**; the rules require a public repository, demo YouTube link and concise writeup. There is no automatic credit for multiplying AWS resources. The source is [WeMakeDevs Environmental Hacks](https://www.wemakedevs.org/aws/env), [rules](https://www.wemakedevs.org/aws/env/rules), and [schedule](https://www.wemakedevs.org/aws/env/schedule). The schedule lists October 11 as submission day; **its precise closing hour was not published on the page at audit time**. Confirm the live submission form.

## 2. Architecture (AWS components with operational roles)

```text
AWS Amplify Hosting (React UI, accessible raster journey map)
    -> Amazon API Gateway /Prod (guest session + validation)
        -> AnalyzeApi AWS Lambda
            -> AWS Step Functions Express (Prepare -> Optimize -> Persist)
                Prepare Lambda: fixed-event validation
                Optimize Lambda: Amazon Location Places and Routes V2
                       + modeled environmental forecast providers
                       + deterministic exposure/feasible-day optimizer
                Persist Lambda: DynamoDB draft
        -> Accept Lambda -> DynamoDB transaction (idempotent, excludes demos from impact)
        -> History / Impact Lambda -> DynamoDB strongly consistent reads
        -> Explain Lambda -> optional Amazon Bedrock with numeric grounding / deterministic fallback
        -> India and CurrentEnvironment Lambda -> labeled modeled city data
    -> CloudWatch dashboard + alerts (API p95 timeout risk, Lambda errors, Step Functions failure)
```

Production **shared journey map is OpenStreetMap DOM raster**, not Amazon Location's map tiles. Amazon Location is used for live route and place APIs; India can use an AWS map basemap. Do not say the map itself is powered by AWS on every screen.

## 3. Verified code problems and targeted fixes

| Area | Confirmed from code | Fix |
|---|---|---|
| Environmental provenance | Open-Meteo hourly grid forecasts described as “realtime” | Identify modeled US EPA AQI forecast; show provider and fetch timestamp. No sensor/station claim. |
| India coverage | Six model points labeled monitoring “stations”; failed provider returned AQI 0 | Explicit “city model sample” with missing data shown as unavailable, US AQI standard disclosed. |
| Settings | UI “Fastest Route” actually set extra travel budget to zero; objective stayed exposure | Replace fake fastest choice with accurately described extra-travel constraint. |
| Personal impact | Accepted demo plans included in plan count; relative daily indices added together | Exclude demo plans; show recent real accepted count and average percent modeled exposure change. |
| Impact failures | API error silently displayed zeros as real records | Error state and retry, never invent zero savings. |
| Input safety | Exposure accepted nonfinite pollutant inputs and negative sample durations | Validate sample values, positive time and sample-duration coverage. |
| DynamoDB immediately after acceptance | Draft/history reads used eventual consistency by default | Strongly consistent read for draft, history and impact. |
| AWS deployment result | Deploy script returned success after start-deployment | Wait for Amplify SUCCEED, fail on upload/deploy error, run separate prod AWS smoke. |
| Cloud operations | No explicit operational dashboard/latency alarm in SAM | Add CloudWatch dashboard and four failure/latency alarms; reduce sensitive Step Functions log payloads. |
| AWS map key | Static browser key embedded in deployment and wildcard referer present | Stop embedding literal key; restrict referers to configured production domain and local dev. |

**Why PM10 and AQI were not added to the score:** They correlate with or derive from particulate inputs; arbitrarily combining them with PM2.5 risks double counting. The decision metric remains transparently **modeled exposure**, with heat/UV outdoor penalties and separate CO₂e estimates.

## 4. Test gates

| Gate | Coverage / meaning |
|---|---|
| TypeScript/backend tests | Parsing, fixed-event constraints, route calculations, privacy, exposure input validation, deliberate higher-exposure counterexample |
| 2,000 randomized optimizer differential trials | Compare optimizer selection to exhaustive small-problem selection with same scoring objective |
| 12-stop and GPS tests | Valid timed stops, overlap and coordinate guards |
| Local API smoke | Unauthenticated analysis rejection, controlled demo, repeated accept idempotency, isolated history, demo impact exclusion |
| Headless Chromium | Six reloads with delayed environmental API data, DOM raster map sizing/tiles, multi-stop editor, seven page tabs, route markers/clicks, mobile |
| SAM validation and build | Validate deployability and TypeScript Lambda bundles |
| Post-Amplify production smoke | Disposable **demo** session: API Gateway → Lambda → Express Step Functions → DynamoDB → explanation → accept twice → history → guest isolation; Guntur/Delhi modeled environment probes |
| CloudWatch | Monitor p95 latency / errors from real production traffic |

**Important:** Headless Chromium uses mocked environmental/tile/demo responses. It does not establish real CPCB station coverage, actual road route quality in six cities, or production load performance with twelve events. Those must be described as distinct checks.

## 5. Known limitations requiring an independent follow-up

- **Sync API Gateway timeout:** The backend calls Express Step Functions synchronously. A multi-journey live request may exceed the practical REST gateway window (~29 seconds). A CloudWatch alarm flags p95 over 25 seconds. Converting to an asynchronous job API requires measured production latency/cost and a new status endpoint. Do not describe the 12-stop editor as fully stress-proven in production.
- **CPCB/CAAQMS station feed:** India's official real-time air-quality dataset exists via data.gov.in, but API key/usage terms and live access have not been validated. We have not connected it or misrepresented forecast grid samples as physical monitoring stations.
- **Geographic parity:** Guntur, Delhi, Mumbai, Bengaluru, Hyderabad and Chennai need *separate* live geocoding, supported routing mode, provider-data freshness and feasibility tests. Guntur and Delhi current-hour environmental probes are not evidence of six-city routing coverage.
- **Scientific limits:** Exposure scores are model-based relative rankings, not personal inhaled dosage, clinical health outcomes, or an independent measurement of local air quality. Accepted plans are intentions, not proven trips taken.
- **Impact history:** Personal history fetch is capped to recent 20; labels disclose that limit.
- **Costs:** Extra CloudWatch dashboard metrics and alarms create some AWS usage; monitor/remove the dashboard after the event if not useful.
- **Reliability:** Third-party tiles, Open-Meteo, Tomorrow.io and Amazon Location can fail independently; errors should be visible instead of fabricated fallback readings.

## 6. Three-minute demonstration plan

1. **0:00–0:25** — Problem: high-UV and PM2.5 exposure during a student's normal day; show home conditions with **US AQI/model provenance**.
2. **0:25–1:10** — Enter timed Guntur stops (gym, college/office, lunch). Show fixed commitments and current GPS map.
3. **1:10–1:55** — Optimize; compare original and recommended *feasible* journeys, time changes, modeled exposure, and estimated CO₂e separately. Use actual live routes only after they have been confirmed.
4. **1:55–2:30** — Controlled demo fallback if necessary: accept once, reopen History, show estimated Impact (demo excluded). Explain that the control scenario is labeled demo.
5. **2:30–3:00** — Show AWS Console: deployed Amplify app, Step Functions workflow, Lambda functions, DynamoDB persistence and CloudWatch dashboard. If Bedrock is not configured, describe it as optional, not active.

**Submission checklist:** public repository, ≤3-minute YouTube video tested signed out, concise problem/build/AWS writeup, disclosure of AI assistance, original work after event opened. Do not manufacture CPCB measurements, emissions outcomes, or live-provider results.
