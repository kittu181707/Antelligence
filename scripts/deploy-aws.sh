#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-ai-personal-pollution-optimizer}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
AMPLIFY_APP_NAME="${AMPLIFY_APP_NAME:-ai-personal-pollution-optimizer}"
AMPLIFY_BRANCH="${AMPLIFY_BRANCH:-prod}"
TOMORROW_IO_API_KEY="${TOMORROW_IO_API_KEY:-}"
BEDROCK_MODEL_ID="${BEDROCK_MODEL_ID:-}"
APP_TIMEZONE_OFFSET="${APP_TIMEZONE_OFFSET:-+05:30}"

for command in aws sam npm zip curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done

aws sts get-caller-identity --region "$AWS_REGION" >/dev/null

echo "==> Building and deploying AWS backend"
sam validate
sam build --parallel
sam deploy   --stack-name "$STACK_NAME"   --region "$AWS_REGION"   --resolve-s3   --capabilities CAPABILITY_IAM   --no-confirm-changeset   --no-fail-on-empty-changeset   --parameter-overrides     DemoMode=false     BedrockModelId="$BEDROCK_MODEL_ID"     TomorrowIoApiKey="$TOMORROW_IO_API_KEY"     MapAllowedReferer="http://localhost:5173/*"     AppTimezoneOffset="$APP_TIMEZONE_OFFSET"

API_ENDPOINT="$(aws cloudformation describe-stacks   --stack-name "$STACK_NAME"   --region "$AWS_REGION"   --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue | [0]"   --output text)"

if [[ -z "$API_ENDPOINT" || "$API_ENDPOINT" == "None" ]]; then
  echo "Could not resolve ApiEndpoint from stack $STACK_NAME" >&2
  exit 1
fi

echo "==> Building frontend against $API_ENDPOINT"
pushd frontend >/dev/null
npm install
npm audit --audit-level=high
npm run test:ui
npm run typecheck
VITE_API_BASE_URL="$API_ENDPOINT" npm run build
popd >/dev/null

mkdir -p .deploy
rm -f .deploy/frontend.zip
(cd frontend/dist && zip -qr ../../.deploy/frontend.zip .)

APP_ID="${AMPLIFY_APP_ID:-}"
if [[ -z "$APP_ID" ]]; then
  APP_ID="$(aws amplify list-apps     --region "$AWS_REGION"     --query "apps[?name=='$AMPLIFY_APP_NAME'].appId | [0]"     --output text)"
fi

if [[ -z "$APP_ID" || "$APP_ID" == "None" ]]; then
  echo "==> Creating Amplify Hosting app"
  APP_ID="$(aws amplify create-app     --name "$AMPLIFY_APP_NAME"     --region "$AWS_REGION"     --platform WEB     --query 'app.appId'     --output text)"
fi

if ! aws amplify get-branch --app-id "$APP_ID" --branch-name "$AMPLIFY_BRANCH" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws amplify create-branch     --app-id "$APP_ID"     --branch-name "$AMPLIFY_BRANCH"     --stage PRODUCTION     --region "$AWS_REGION" >/dev/null
fi

echo "==> Uploading frontend to Amplify"
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment   --app-id "$APP_ID"   --branch-name "$AMPLIFY_BRANCH"   --region "$AWS_REGION"   --query '[jobId,zipUploadUrl]'   --output text)

if [[ -z "$JOB_ID" || -z "$UPLOAD_URL" ]]; then
  echo "Amplify did not return a deployment URL" >&2
  exit 1
fi

curl --fail --silent --show-error -T .deploy/frontend.zip "$UPLOAD_URL" >/dev/null
aws amplify start-deployment   --app-id "$APP_ID"   --branch-name "$AMPLIFY_BRANCH"   --job-id "$JOB_ID"   --region "$AWS_REGION" >/dev/null

DEFAULT_DOMAIN="$(aws amplify get-app   --app-id "$APP_ID"   --region "$AWS_REGION"   --query 'app.defaultDomain'   --output text)"
SITE_URL="https://${AMPLIFY_BRANCH}.${DEFAULT_DOMAIN}"
REFERER="${SITE_URL}/*"

echo "==> Restricting Amazon Location browser key to $REFERER"
sam deploy   --stack-name "$STACK_NAME"   --region "$AWS_REGION"   --resolve-s3   --capabilities CAPABILITY_IAM   --no-confirm-changeset   --no-fail-on-empty-changeset   --parameter-overrides     DemoMode=false     BedrockModelId="$BEDROCK_MODEL_ID"     TomorrowIoApiKey="$TOMORROW_IO_API_KEY"     MapAllowedReferer="$REFERER"     AppTimezoneOffset="$APP_TIMEZONE_OFFSET"

echo "==> Waiting for Amplify deployment"
for _ in {1..90}; do
  STATUS="$(aws amplify get-job     --app-id "$APP_ID"     --branch-name "$AMPLIFY_BRANCH"     --job-id "$JOB_ID"     --region "$AWS_REGION"     --query 'job.summary.status'     --output text)"
  case "$STATUS" in
    SUCCEED)
      echo "==> Verifying deployed live services"
      API_ROOT="${API_ENDPOINT%/}"
      curl --fail --silent --show-error "$SITE_URL" >/dev/null

      RUNTIME_JSON="$(curl --fail --silent --show-error "$API_ROOT/api/runtime-config")"
      LIVE_JSON="$(curl --fail --silent --show-error         -H 'content-type: application/json'         -d '{"position":{"lat":28.6139,"lon":77.2090}}'         "$API_ROOT/api/environment/current")"

      RUNTIME_JSON="$RUNTIME_JSON" LIVE_JSON="$LIVE_JSON" node --input-type=module <<'NODE'
      const runtime = JSON.parse(process.env.RUNTIME_JSON || '{}');
      const live = JSON.parse(process.env.LIVE_JSON || '{}');
      if (!runtime.mapApiKey || !runtime.region) throw new Error('deployed Amazon Location runtime configuration is incomplete');
      for (const key of ['aqi','pm25','pm10','temperature','uvIndex','rainProbability']) {
        if (!Number.isFinite(Number(live[key]))) throw new Error('deployed live environment is missing ' + key);
      }
      if (!/Open-Meteo|Tomorrow\.io/.test(String(live.source || ''))) throw new Error('deployed environment endpoint has no identified model/provider source');
      if (String(live.source || '').includes('Controlled demo')) throw new Error('production environment endpoint returned demo data');
      console.log('live Amazon map configuration and environmental feed verified');
NODE

      echo "Deployment ready: $SITE_URL"
      echo "API endpoint: $API_ENDPOINT"
      exit 0
      ;;
    FAILED|CANCELLED)
      echo "Amplify deployment ended with status: $STATUS" >&2
      exit 1
      ;;
  esac
  sleep 10
done

echo "Amplify deployment is still running. Check app $APP_ID branch $AMPLIFY_BRANCH." >&2
exit 2
