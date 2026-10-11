import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relative) => readFileSync(join(root, relative), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error('UI contract failed: ' + message);
};

const app = read('src/App.tsx');
const map = read('src/components/Map.tsx');
const today = read('src/screens/TodayScreen.tsx');
const nav = read('src/components/BottomNav.tsx');
const liveSnapshot = read('src/components/LiveEnvironmentSnapshot.tsx');
const errorBoundary = read('src/components/ErrorBoundary.tsx');
const entryFile = read('src/main.tsx');
const travel = read('src/screens/ImportScreen.tsx');
const accepted = read('src/screens/AcceptedScreen.tsx');
const india = read('src/screens/IndiaScreen.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const impact = read('src/screens/ImpactScreen.tsx');
const template = read('../template.yaml');
const environment = read('../backend/src/services/environment.ts');
const api = read('src/api.ts');
const pkg = read('package.json');
const mapCss = read('src/components/Map.css');
assert(mapCss.includes('height: 100%') && mapCss.includes('.raster-tile'), 'map must have visible real dimensions and tile styles');
const utils = read('src/utils.ts');
const backendAuth = read('../backend/src/auth.ts');

assert(map.includes('data-map-engine="dom-raster"'), 'shared map must render independently of WebGL');
assert(!map.includes('maplibregl') && !map.includes('new maplibregl.Map'), 'shared map must never construct WebGL contexts');
assert(map.includes('tile.openstreetmap.org') && map.includes('openstreetmap.fr/hot') && map.includes('openstreetmap.org/export/embed.html'), 'shared map must have multiple real raster basemap fallback paths');
assert(map.includes('ResizeObserver') && map.includes('raster-stop-marker') && map.includes('raster-stop-detail'), 'shared map must support resizing and clickable stop details');
assert(map.includes('bestView') && map.includes('routePath') && map.includes('raster-route-optimized'), 'multi-stop route geometry must remain mapped');
assert(map.includes('onPointerDown') && map.includes('Find my location'), 'shared map must support touch and live GPS navigation');
assert(pkg.includes('maplibre-gl') && !pkg.includes('"leaflet"') && !pkg.includes('"react-leaflet"'), 'AWS-recommended renderer dependency contract changed');
assert(india.includes('maps.geo.') && india.includes("traffic: 'All'"), 'India map must also use Amazon Location Maps V2');
assert(!india.includes('react-leaflet') && !india.includes('cartocdn'), 'India view must not reintroduce third-party map tiles');

assert(settings.includes('extra-travel budget') || settings.includes('Extra-travel budget'), 'settings must expose the actual travel budget');
assert(!settings.includes('Fastest Route'), 'UI must never imply that zero extra minutes changes the exposure objective to fastest-route optimization');
assert(impact.includes("dataMode === 'live'") && impact.includes('temporarily unavailable'), 'Impact must exclude demos and not silently show false zeros');
assert(india.includes('not CPCB monitoring stations') && india.includes('US EPA scale'), 'India view must disclose model samples and AQI standard');
assert(environment.includes('current-hour model forecast') && !environment.includes('Open-Meteo realtime fallback'), 'Open-Meteo must not be mislabeled as sensor realtime observations');
assert(template.includes('AWS::CloudWatch::Dashboard') && template.includes('AnalyzeLatencyAlarm'), 'AWS cloud health dashboard and latency alarms missing');
assert(template.includes('IncludeExecutionData: false'), 'workflow logs must not expose private agenda/GPS payload');
assert(!template.includes("            - '*'"), 'map API key must not retain wildcard referer alongside constrained domain');
assert(app.includes('LiveEnvironmentSnapshot'), 'shared top bar must show real environmental data across pages');
assert(entryFile.includes('<ErrorBoundary') && app.includes('<ErrorBoundary label="Live map"') && app.includes('<ErrorBoundary label="Live conditions"'), 'map and live conditions errors must not cause a white screen');
assert(errorBoundary.includes('getDerivedStateFromError') && errorBoundary.includes('Try again'), 'render crash must present a recoverable UI');
assert(app.includes('app-topbar') && app.includes('global-map-col'), 'all pages must use the shared header and compact map');
assert(app.includes('className="ant-brand" aria-label="Antelligence — return to start"') && app.includes('onClick={goHome}') &&
  app.includes("navigate('today', 'final')") && read('src/screens/FinalPlanScreen.tsx').includes('Appointments at risk (estimated)'),
  'logo must reset to start and successful analysis must open an honest final plan');
const sharedHeaderStyles = read('src/styles.css');
const emblem = read('public/antelligence-emblem.svg');
assert(emblem.includes('viewBox="0 0 188 160"') &&
  emblem.includes('fill-rule="evenodd"') &&
  !emblem.includes('<image') && !emblem.includes('base64'),
  'emblem must use transparent vector artwork, not a pasted rectangular image');
assert(app.includes('src="/antelligence-emblem.svg"') &&
  app.includes('className="ant-brand-wordmark"') &&
  app.includes('>ntelligence</span>') &&
  app.includes('aria-label="Antelligence"') &&
  app.includes('<p>Intelligence through coordination</p>') &&
  !app.includes('src="/antelligence-wordmark.png"'),
  'header must render the large vector A, selectable wordmark and exact tagline');
assert(sharedHeaderStyles.includes('.ant-brand-emblem {') &&
  sharedHeaderStyles.includes('.ant-brand-wordmark {') &&
  sharedHeaderStyles.includes('background-clip: text;') &&
  sharedHeaderStyles.includes('.app-welcome .ant-brand-copy p {') &&
  sharedHeaderStyles.includes('.top-environment { flex: 0 1 45%;') &&
  sharedHeaderStyles.includes('.top-environment .env-chip { min-width: 0;'),
  'brand must blend into the white header without disturbing live conditions');
assert(app.includes('<div className="top-environment">') &&
  app.includes('<LiveEnvironmentSnapshot homeLocation={agenda.homeLocation} liveLocation={liveLocation} isDemo={isDemo} chipMode={true}/>'),
  'brand update must preserve the existing right-hand live environmental data');
assert(nav.includes("['map', 'Map', MapIcon]") && nav.includes("['today', 'Today', CalendarDays]") && nav.includes("['settings', 'Settings', Settings]"),
  'primary navigation must offer only Today, Map and Settings');
assert(!nav.includes("['optimize',") && !nav.includes("['impact',") && !nav.includes("['history',"),
  'unused destinations must not clutter the judging dock');
assert(nav.includes('aria-current') && app.includes("tab === 'map'"),
  'active indicator and full-page map must follow the selected tab');
assert(app.includes('fullpage-map-canvas') && app.includes("tab !== 'map'"),
  'map page must take full width and preserve entered stops');
assert(today.includes('Enter your day') && today.includes('Try judge demo · 1 click'),
  'the primary CTA and one-click judge demo must be easy to recognize');
assert(today.includes('Google / Apple Calendar · export an .ics file'),
  'calendar import must advertise portable .ics exports honestly');
const landingCss = read('src/styles.css');
assert(landingCss.includes('grid-column: 1 / -1; grid-row: 2') ||
  landingCss.includes('grid-column: 1 / -1; grid-row: 2;'),
  'the three-step landing cards must fill the space beneath the map');
assert(landingCss.includes('overflow: hidden !important') && landingCss.includes('.fullpage-map-screen'),
  'desktop landing must not scroll and map tab must have independent viewport layout');

assert(app.includes("else if (tab === 'history')") || app.includes("if (tab === 'history')"), 'history must stay within the shared layout');
const planner = read('src/screens/ImportScreen.tsx');
assert(planner.includes('Add another stop') && planner.includes('Use my location') && planner.includes('type="time"'), 'planner must support GPS and multiple timed stops');
assert(!today.includes('<strong>86</strong>') && !today.includes('Source: CPCB • Updated 4 min ago'), 'fake environmental snapshot must not return');
assert(liveSnapshot.includes('api.currentEnvironment'), 'live snapshot must call backend environmental feed');
assert(liveSnapshot.includes('isEnvironmentSnapshot(next)') && liveSnapshot.includes('REQUIRED_MEASUREMENTS'), 'invalid environmental JSON must be rejected before rendering');
assert(!liveSnapshot.includes('setEnvironment(null); // Never show previous'), 'environment must not clear last readings on itinerary edits');
assert(liveSnapshot.includes('5 * 60_000'), 'live snapshot must refresh every five minutes');
assert(liveSnapshot.includes('navigator.geolocation'), 'live snapshot must support browser location when home is unknown');
assert(api.includes('/api/runtime-config') && api.includes('/api/environment/current'), 'live frontend APIs missing');
assert(api.includes('/api/places/resolve') && template.includes('ResolvePlaceFunction'), 'live place geocoding endpoint missing');
assert(map.includes('raster-route-preview') && app.includes('previewPoints={previewPoints}'), 'map must preview typed stops before analysis');
const historyScreen = read('src/screens/HistoryScreen.tsx');
const overviewScreen = read('src/screens/OverviewScreen.tsx');
const analysisScreen = read('src/screens/AnalysisScreen.tsx');
assert(app.includes("'AWS route view'") && app.includes("'AWS routes'") &&
  app.includes("'Demo route map'") && app.includes("'Demo map'"),
  'shared map titles must name AWS routing but keep controlled demos distinct');
assert(map.includes("'AWS routes'") && map.includes("'AWS places'") &&
  map.includes("'OSM map'") && map.includes("'Demo · OSM'") &&
  map.includes('© OpenStreetMap') && map.includes('tile.openstreetmap.org'),
  'AWS route/place badges must not misrepresent OpenStreetMap tiles or demo routes');
assert(today.includes('Amazon Location · Lambda · Step Functions') &&
  today.includes('AWS route analysis') && today.includes('Explore AWS routes') &&
  overviewScreen.includes('AWS STEP FUNCTIONS') &&
  analysisScreen.includes('AWS Step Functions'),
  'existing route and workflow labels must use real AWS service names');
assert(planner.includes('Find place via Amazon Location') &&
  planner.includes('AWS car-road geometry') &&
  historyScreen.includes('DynamoDB plans') &&
  india.includes('AMAZON LOCATION MAP') && india.includes('CITY SAMPLE VIEW · MODEL DATA'),
  'place search, persistence and AWS-map names must stay accurate, including fallbacks');
assert(liveSnapshot.includes('Tomorrow.io') && liveSnapshot.includes('Open-Meteo'),
  'environment providers must not be relabeled as AWS data');
assert(travel.includes('Use Car for all journeys') && travel.includes('AWS Bus/Metro routes'), 'unsupported live transit must retain an actionable fallback on the stops page');
const styles = read('src/styles.css');
assert(styles.includes('position: static !important') && styles.includes('.planner-travel-modes'), 'direct planner CTA and inline mode selector must fit without overlaying form');
assert(app.includes('planner-layout') && app.includes('planner-map-review-button') &&
  app.includes('disabled={busy || !canReviewAgenda(agenda)}') &&
  app.includes('onClick={runAnalysis}'),
  'map-side action must analyze directly with validated stops, without a separate review page');
assert(styles.includes('.global-split-layout.planner-layout') &&
  styles.includes('.planner-layout .global-panel-col') &&
  styles.includes('scrollbar-gutter: stable;') &&
  styles.includes('.planner-layout .itinerary-list,') &&
  styles.includes('overflow: visible;') &&
  styles.includes('.planner-layout .itinerary-editor .itinerary-submit { display: none !important; }'),
  'desktop planner must scroll the full left column while keeping the right map-side Review');


assert(!app.includes("step === 'travel'") && !app.includes('TravelScreen') &&
  !app.includes('continueToTravel'), 'intermediate journey-review screen must be removed');
assert(app.includes('isAnalyzing && <AnalysisScreen completed={analysisComplete}/>') &&
  !app.includes("setStep('analysis')") &&
  app.includes('setIsAnalyzing(false)'),
  'live Analyze must run over the current planner and unmount the overlay on success AND failure');
const overlay = read('src/screens/AnalysisScreen.tsx');
assert(overlay.includes('aria-modal="true"') && overlay.includes('data-analysis-overlay') &&
  overlay.includes('Progress animation is illustrative') &&
  overlay.includes('data-analysis-step') && overlay.includes('completed') &&
  overlay.includes('analysis-orbit-leaf') && !overlay.includes('analysis-stage-list'),
  'overlay must show a leaf and one illustrative stage at a time, with final completion linked to API success');
assert(styles.includes('.analysis-overlay-content') &&
  styles.includes('background: transparent') &&
  styles.includes('backdrop-filter: blur(25px)') &&
  !styles.includes('.analysis-overlay-card'),
  'analysis must be full-viewport blurred glass with no visible modal box');
assert(overlay.includes('analysis-orbit-object') &&
  overlay.includes('<Route size={16}') &&
  overlay.includes('<CloudSun size={16}') &&
  overlay.includes('<Leaf size={16}') &&
  styles.includes('.analysis-orbit-circle.orbit-three .analysis-orbit-object') &&
  styles.includes('animation: analysis-spin 6s linear infinite reverse;') &&
  styles.includes('animation: analysis-spin 8s linear infinite;'),
  'three small route, weather and nature icons must ride continuously spinning rings');
const routeService = read('../backend/src/services/routes.ts');
assert(routeService.includes("input.mode === 'walk' ? 'Pedestrian'") &&
  routeService.includes('estimatedBikeMinutes') &&
  routeService.includes('car-road geometry') &&
  routeService.includes('not bicycle-verified'),
  'Bike estimates must use verified AWS road geometry and explicit not bicycle-verified provenance');

assert(travel.includes('transportChoices') && travel.includes('planner-travel-budget') &&
  travel.includes('Return home') && travel.includes('onAnalyze'),
  'stop page must support mode, departure, return journey, budget and direct Analyze');
assert(app.includes('isDemo={isDemo}'), 'demo/live provenance must flow into screens and map');
assert(travel.includes('planner-bike-note') &&
  travel.includes('Cycling access and road safety are not verified') &&
  !travel.includes("disabled={option.value === 'bike'}"),
  'Bike must remain selectable with a visible approximation/safety disclosure');
assert(!accepted.includes('google.com/maps'), 'accepted plan must not substitute an unanalyzed Google route');

assert(utils.includes("raw === null"), 'missing extra-travel preference must use default');
assert(utils.includes("crypto.subtle.digest"), 'private user ID must derive from bearer secret');
assert(api.includes("Authorization:"), 'private API requests must include bearer secret');
assert(backendAuth.includes("timingSafeEqual"), 'server must compare user identity safely');
assert(liveSnapshot.includes('LAST READINGS · RETRYING') && liveSnapshot.includes('setError(cause'), 'preserve and clearly label last good environmental readings on refresh failure');
console.log('live AWS product and private-session contract passed');
