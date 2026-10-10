# Architecture

The browser collects agenda/travel preferences and renders route overlays on a GPU-independent OpenStreetMap raster map. Live route generation, environmental scoring and whole-day ranking stay on AWS. The India overview optionally uses Amazon Location Maps V2 as its basemap.

## Analysis workflow
1. API Gateway calls the analysis Lambda.
2. A synchronous Express Step Functions workflow runs Prepare, Optimize and Persist.
3. Optimize uses Amazon Location Routes V2, backend environmental inputs and the deterministic exposure model.
4. Persist stores the analyzed plan in DynamoDB.
5. Bedrock is optional and only explains structured optimizer facts.

## Data and guest-session boundaries

Private API endpoints derive an anonymous guest user ID from a random 256-bit bearer secret. The client sends the credential in an authorization header; saved plans, history and explanation requests enforce the derived ID. Guest credentials are not verified user accounts and have no recovery mechanism.

Accepted plans use deterministic DynamoDB sort keys and transactional writes so concurrent retries do not increment global impact more than once. Demo plans never add to production impact. Environmental exposure uses forecasts, time/route approximations, and route-mode factors, not measured individual dose.

## Hard constraints
- Fixed event times do not move.
- Candidates must arrive by the next fixed event.
- Total extra travel stays within the user's tolerance.
- Impossible candidates are excluded.

Modeled exposure combines PM2.5 × minutes × mode factor with outdoor heat/UV/weather penalties. The original day is normalized to an index of 100; this is a relative decision-support model, not a medical dose.

## Observability and privacy

CloudWatch alarms monitor API Lambda errors, optimizer errors, Step Functions execution failures, and p95 API Lambda duration over 25 seconds (approaching API Gateway's timeout). A CloudWatch dashboard shows those metrics and DynamoDB capacity. The Express workflow intentionally logs only errors with `IncludeExecutionData: false`: personal agenda details and raw GPS inputs are not copied into Step Functions execution logs. The dashboard is for operators, not a claim that real-world exposure improvement has been medically verified.

## Environmental provenance

`Open-Meteo` returns hourly modeled forecasts, including **US EPA AQI**. These are not CPCB observations. The India screen samples six representative city coordinates, not physical air-quality monitoring stations; missing data is displayed as unavailable instead of AQI zero. Tomorrow.io is optional. PM2.5 is the particulate variable in modeled exposure, with temperature/UV outdoor penalties; PM10 and AQI are shown for context rather than double-counted as independent exposure factors.

## Release verification

The GitHub `ci` workflow runs optimizer stress tests, AWS SAM validation and headless Chromium regressions. The `CI/CD Pipeline` then deploys the backend, waits for Amplify to succeed, and uses a disposable anonymous guest in a controlled demo scenario to exercise API Gateway, Express Step Functions, deterministic or Bedrock explanations, DynamoDB transactional accept, History, and guest-session isolation. Demo plans never contribute to real community impact counters. Real-route coverage in India requires a separate geography/provenance audit.
