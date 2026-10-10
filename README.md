# AI Personal Pollution Optimizer

A whole-day environmental exposure optimizer that keeps fixed appointments intact while finding practical route, mode, and timing changes with lower modeled pollution exposure.

## Production stack

- **Maps:** Responsive GPU-independent OpenStreetMap DOM/raster journey map with GPS, pan/zoom, route overlays and clickable stops; the India overview uses Amazon Location Maps V2 with MapLibre and a city-sample fallback.
- **Routes:** Amazon Location Routes V2 for live car, pedestrian, and transit routing. The app does not fabricate bicycle routes when live Amazon routing cannot verify them.
- **Geocoding:** Amazon Location Places.
- **Weather + UV + air quality:** Tomorrow.io when a server-side key is supplied; Open-Meteo automatically remains a live fallback.
- **Optimization:** AWS Lambda + Express Step Functions.
- **Explanations:** Amazon Bedrock, grounded in deterministic optimizer results.
- **Persistence:** DynamoDB.
- **Frontend:** AWS Amplify compatible.

## Live behavior

The India map's public browser key is created by the SAM stack and restricted to the configured Amplify referer and Amazon Location Maps V2 actions. It is read from `/api/runtime-config` and is **not** embedded as a permanent string in the frontend build. The journey map uses standard OpenStreetMap raster tiles and a no-WebGL fallback without any Amazon map key.

Current environmental model/provider values refresh every five minutes. Open-Meteo fallback responses contain hourly modeled weather and US EPA AQI forecasts, **not CPCB monitoring observations**. The UI identifies the source, retrieval time and US AQI standard. If the user has entered a real home location, Amazon Places geocodes it. Otherwise the browser may request location permission. The UI never substitutes hardcoded AQI/weather values for a failed live request.

Tomorrow.io is optional. Without a Tomorrow.io key, the backend still returns live weather, UV, PM2.5, PM10, AQI, humidity, wind, and rain probability through the Open-Meteo fallback.

## Local development

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

In another terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

For local interactive Amazon maps, `AMAZON_LOCATION_API_KEY` may be placed in `backend/.env`. Without it, the shared journey map still renders real raster tiles. The India overview can fall back to labeled city readings when AWS MapLibre is unavailable.

## AWS deployment

For a full AWS deployment from an authenticated AWS CLI session, the repository now includes a one-command deployer. It deploys the SAM backend, reads the API endpoint, builds the frontend against it, creates/reuses an Amplify Hosting app, uploads the production build, tightens the Amazon Location map-key referer to the resulting Amplify domain, then verifies the live map configuration and realtime environmental endpoint.

```bash
bash scripts/deploy-aws.sh
```

Optional environment overrides include `AWS_REGION`, `STACK_NAME`, `AMPLIFY_APP_NAME`, `AMPLIFY_BRANCH`, `TOMORROW_IO_API_KEY`, and `BEDROCK_MODEL_ID`. Tomorrow.io is not required because Open-Meteo remains the live fallback.

For manual deployment, install the SAM TypeScript builder and deploy:

```bash
npm install --global esbuild@0.24.2
sam validate
sam build --parallel
sam deploy --guided
```

Recommended SAM parameter values:

```text
DemoMode=false
AppTimezoneOffset=+05:30
TomorrowIoApiKey=<optional server-side Tomorrow.io key>
MapAllowedReferer=*
```

For a production domain, replace `MapAllowedReferer=*` with the Amplify/site referer pattern after the first deployment.

Deploy `frontend/` to Amplify and set:

```text
VITE_API_BASE_URL=<ApiEndpoint output from the SAM stack>
```

That is the only required frontend deployment variable. `VITE_AMAZON_LOCATION_API_KEY` is an optional local/debug override; production discovers the SAM-created key automatically.

## Privacy, provenance, and limits

- Anonymous sessions use a random 256-bit browser bearer credential. Server-side endpoints derive the user ID using SHA-256, verify plan ownership, and reject access by another guest identity. This is **not verified account authentication**. Removing local browser storage loses access to anonymous history. Pre-hardening browser IDs are not automatically migrated.
- The demo remains intentionally available. Each controlled demonstration analysis is clearly identified as `demo` and is **excluded from community impact counts**, even when saved. Repeated acceptance is idempotent, including concurrent production requests.
- Pollution and exposure results are modeled estimates, **not personal measured dosage**, block-by-block sensor readings, or health guarantees. The Open-Meteo fallback reports US AQI, not India's CPCB AQI scale. Three route samples do not imply three independent neighborhood measurements.
- Air-quality and weather attribution: [Open-Meteo](https://open-meteo.com/) and the [Copernicus Atmosphere Monitoring Service (CAMS)](https://atmosphere.copernicus.eu/). Third-party forecasts have spatial and temporal limitations; travel-mode factors are approximations rather than calibrated personal inhalation measurements.
- The planner is limited to one calendar day and does not support departures crossing midnight. Express synchronous analysis can hit API Gateway's practical timeout for unusually expensive days; CloudWatch p95 and workflow failures are monitored. The demo-mode production workflow is verified after Amplify deployment, but that is not proof of live route coverage in all six cities.

## Validation

The branch CI validates builds, backend stress tests (including randomized optimizer comparisons) and a GPU-disabled Chromium browser smoke. The production deployment adds an AWS demo workflow smoke that checks real Step Functions, explanations, DynamoDB acceptance, guest isolation, and impact exclusion. Branch CI runs:

```bash
cd backend
npm install
npm run typecheck
npm test

cd ../frontend
npm install
npm run test:ui
npm run typecheck
npm run build

cd ..
sam validate
sam build --parallel
```

The product uses **modeled exposure** and **estimated exposure reduction** language. It does not claim medical safety, disease avoidance, or exact inhaled dose.


## Hackathon: Environmental Hacks · Air track

The project is aimed at the **Air** track of the WeMakeDevs Environmental Hacks event (Oct 8–11, 2026). The official judges value demonstrable impact, operational AWS, usability, working execution, and a three-minute video. Multiple AWS resources are not an automatic scoring multiplier. See [validation and known limitations](docs/HACKATHON_VALIDATION.md).

**Operational AWS view:** CloudWatch dashboard `pollution-backend-environmental-health` when deployed with the `pollution-backend` stack; alarms identify Lambda errors, Step Functions failures, and analysis p95 over 25 seconds. The dashboard has a small ongoing CloudWatch cost, so remove it after the demo if unused.

**Submission requirements:** a public GitHub repository, a YouTube video no longer than three minutes, and a short writeup disclosing AI coding tools, original work, and where AWS runs. Record the video with the real deployed flow and show AWS workflow metrics; do not claim CPCB station readings or proven individual health improvement.
