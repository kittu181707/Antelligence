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
const liveSnapshot = read('src/components/LiveEnvironmentSnapshot.tsx');
const errorBoundary = read('src/components/ErrorBoundary.tsx');
const entryFile = read('src/main.tsx');
const travel = read('src/screens/TravelScreen.tsx');
const accepted = read('src/screens/AcceptedScreen.tsx');
const india = read('src/screens/IndiaScreen.tsx');
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

assert(app.includes('LiveEnvironmentSnapshot'), 'shared top bar must show real environmental data across pages');
assert(entryFile.includes('<ErrorBoundary') && app.includes('<ErrorBoundary label="Live map"') && app.includes('<ErrorBoundary label="Live conditions"'), 'map and live conditions errors must not cause a white screen');
assert(errorBoundary.includes('getDerivedStateFromError') && errorBoundary.includes('Try again'), 'render crash must present a recoverable UI');
assert(app.includes('app-topbar') && app.includes('global-map-col'), 'all pages must use the shared header and compact map');
assert(app.includes("else if (tab === 'history')") || app.includes("if (tab === 'history')"), 'history must stay within the shared layout');
const planner = read('src/screens/ImportScreen.tsx');
assert(planner.includes('Add another stop') && planner.includes('Use my location') && planner.includes('type="time"'), 'planner must support GPS and multiple timed stops');
assert(!today.includes('<strong>86</strong>') && !today.includes('Source: CPCB • Updated 4 min ago'), 'fake environmental snapshot must not return');
assert(liveSnapshot.includes('api.currentEnvironment'), 'live snapshot must call backend environmental feed');
assert(liveSnapshot.includes('isEnvironmentSnapshot(next)') && liveSnapshot.includes('REQUIRED_MEASUREMENTS'), 'invalid environmental JSON must be rejected before rendering');
assert(liveSnapshot.includes('5 * 60_000'), 'live snapshot must refresh every five minutes');
assert(liveSnapshot.includes('navigator.geolocation'), 'live snapshot must support browser location when home is unknown');
assert(api.includes('/api/runtime-config') && api.includes('/api/environment/current'), 'live frontend APIs missing');

assert(app.includes("else if (step === 'travel') content = <TravelScreen"), 'travel confirmation screen must be reachable');
assert(app.includes('isDemo={isDemo}'), 'demo/live provenance must flow into screens and map');
assert(travel.includes("mode.value === 'bike' && !isDemo"), 'unverified bicycle routing must stay disabled in live mode');
assert(!accepted.includes('google.com/maps'), 'accepted plan must not substitute an unanalyzed Google route');

assert(utils.includes("raw === null"), 'missing extra-travel preference must use default');
assert(utils.includes("crypto.subtle.digest"), 'private user ID must derive from bearer secret');
assert(api.includes("Authorization:"), 'private API requests must include bearer secret');
assert(backendAuth.includes("timingSafeEqual"), 'server must compare user identity safely');
assert(liveSnapshot.includes("setEnvironment(null)"), 'stale live conditions must be discarded');
console.log('live AWS product and private-session contract passed');
