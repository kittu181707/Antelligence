import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
const TILE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const env = {
  temperature: 28, aqi: 83, pm25: 23, pm10: 61, uvIndex: 4.5,
  humidity: 64, windSpeed: 7, rainProbability: 10, source: 'Browser smoke fixture',
};
const origin = { lat: 28.6139, lon: 77.2090 };
const gym = { lat: 28.6278, lon: 77.2165 };
const work = { lat: 28.6400, lon: 77.2350 };
const events = [
  { eventId: 'gym', title: 'Gym', location: 'Gym', start: '09:00', end: '09:45', fixed: true },
  { eventId: 'work', title: 'Work', location: 'Office', start: '11:00', end: '17:30', fixed: true },
];
const demoDay = { date: '2026-10-10', homeLocation: 'Home', events };
function candidate(id, tripId, departure, points) {
  return {
    candidateId: id, routeId: id, tripId, mode: 'car', label: 'Car',
    departureTime: departure, shiftMinutes: 0, travelMinutes: 20, distanceKm: 7.3,
    modeledExposure: 25, pollutionExposure: 25, highUvOutdoorMinutes: 0,
    heatRiskOutdoorMinutes: 0, estimatedCo2eKg: 1, source: 'Smoke fixture',
    environment: env, environmentSamples: [{ position: points[0], minutes: 10, environment: env }],
    geometry: points,
  };
}
const trips = [
  { tripId: 'trip-1', origin: 'Home', destination: 'Gym', changed: false, candidatesEvaluated: 2,
    explanation: 'Example route', original: candidate('o1', 'trip-1', '08:35', [origin, gym]),
    recommended: candidate('r1', 'trip-1', '08:35', [origin, {lat:28.619,lon:77.210}, gym]) },
  { tripId: 'trip-2', origin: 'Gym', destination: 'Office', changed: false, candidatesEvaluated: 2,
    explanation: 'Example route', original: candidate('o2', 'trip-2', '10:30', [gym,work]),
    recommended: candidate('r2', 'trip-2', '10:30', [gym,{lat:28.635,lon:77.23},work]) },
];
const analysis = {
  userId: 'smoke', planId: 'smoke-plan', createdAt: new Date().toISOString(),
  date: demoDay.date, events, trips, changes: [],
  metrics: {
    originalExposureIndex: 100, optimizedExposureIndex: 85, exposureReductionPct: 15,
    originalRawExposure: 100, optimizedRawExposure: 85, extraTravelMinutes: 0,
    appointmentsChanged: 0, originalHighUvMinutes: 0, optimizedHighUvMinutes: 0,
    originalHeatRiskMinutes: 0, optimizedHeatRiskMinutes: 0, estimatedCo2eChangeKg: 0,
  },
  workflow: {
    routesEvaluated: 4, dayPlansTested: 16, feasiblePlans: 12, environmentSource: 'fixture',
    routeSource: 'fixture', environmentalSamples: 2, dataMode: 'demo', analysisDurationMs: 5,
  },
};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const errors = [];
let envCalls = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 },
    geolocation: { latitude: origin.lat, longitude: origin.lon },
    permissions: ['geolocation'],
    serviceWorkers: 'block',
  });
  await context.route('**/tile.openstreetmap.org/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }));
  await context.route('**/a.tile.openstreetmap.fr/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }));
  await context.route('**/www.openstreetmap.org/export/embed.html**', async (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#e9efea">Map fallback</body></html>' }));
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let payload = {};
    if (path.endsWith('/api/environment/current')) {
      envCalls += 1;
      // Simulate the delayed data response that has triggered the reported white page.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      payload = envCalls % 3 === 0 ? { temperature: 'invalid' } : env;
    } else if (path.endsWith('/api/places/resolve')) {
      const name = JSON.parse(route.request().postData() || '{}').location || '';
      const coords = name.match(/^(-?\\d+\\.\\d+),\\s*(-?\\d+\\.\\d+)$/);
      payload = { location: name, position: coords ? { lat: Number(coords[1]), lon: Number(coords[2]) } : gym, source: 'Amazon Location Places V2' };
    } else if (path.endsWith('/api/demo/day')) payload = demoDay;
    else if (path.endsWith('/api/day/analyze')) payload = analysis;
    else if (path.endsWith('/api/runtime-config')) payload = { mapApiKey: null, region: 'us-east-1', mapStyle: 'Standard', source: 'fixture' };
    else if (path.endsWith('/api/history')) payload = { plans: [] };
    else if (path.endsWith('/api/impact/community')) payload = { totalPlans: 0, totalCo2eSaved: 0 };
    else if (path.endsWith('/api/india')) payload = { stations: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  const check = async (label, mobile = false) => {
    assert(await page.locator('#root .app-welcome').isVisible(), label + ': root/header disappeared');
    const frame = page.locator('.compact-map-frame');
    assert(await frame.isVisible(), label + ': map frame is not visible');
    const rect = await frame.boundingBox();
    assert(rect && rect.width >= (mobile ? 250 : 275) && rect.height >= 200,
      label + ': map dimensions invalid: ' + JSON.stringify(rect));
    assert(await page.locator('[data-map-engine="dom-raster"]').count() === 1,
      label + ': missing DOM raster map');
    assert(await page.locator('.raster-tile').count() > 0, label + ': map is missing real tile images');
    if (!mobile) {
      assert(rect.x > 1365 / 2, label + ': map is not in the right-hand column: ' + rect.x);
    }
    assert(errors.length === 0, label + ': uncaught browser exceptions: ' + errors.join('; '));
  };

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await check('initial home');
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 15000 });
  // Remain completely idle during initial delayed GPS/environment update window.
  await page.waitForTimeout(5000);
  await check('six-second untouched home');
  await page.screenshot({ path: '/tmp/pollution-home-desktop.png', fullPage: true });

  for (let i = 0; i < 6; i += 1) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1700);
    await check('hard-refresh ' + (i + 1));
  }
  const input = page.getByRole('button', { name: 'Enter Origin & Destination' });
  await input.click();
  const indianDate = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const value = (kind) => parts.find((part) => part.type === kind)?.value;
    return value('year') + '-' + value('month') + '-' + value('day');
  };
  assert.equal(await page.locator('#day-date').inputValue(), indianDate(),
    'planner day must match India timezone even when Chromium runs on UTC');
  await page.locator('#day-date').fill(indianDate(new Date(Date.now() - 86_400_000)));
  assert(await page.getByText('selected day has passed in India').isVisible(),
    'past-day forecast must show an actionable date warning');
  await page.getByRole('button', { name: 'Use today' }).click();
  assert.equal(await page.locator('#day-date').inputValue(), indianDate(),
    'Use today must recover the date without clearing stops');

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: 'Add another stop' }).click();
  }
  assert.equal(await page.locator('.itinerary-stop').count(), 3, 'three scheduled stops must be editable');
  // Regression for a user-reported time editor disappearance in a small browser.
  // Both native time fields are controlled React inputs; editing must retain the
  // same event and leave the Review button enabled once all details are complete.
  const firstDeparture = page.getByLabel('Stop 1 departure');
  await firstDeparture.fill('10:00');
  assert.equal(await firstDeparture.inputValue(), '10:00', 'edited leave time must persist');
  assert.equal(await page.locator('.itinerary-stop').count(), 3, 'time editing must not remove the event');
  await page.getByLabel('Stop 1 arrival').fill('08:30');
  assert.equal(await page.getByLabel('Stop 1 departure').inputValue(), '09:15',
    'changing arrival must update default departure without removing the event');
  await page.getByLabel('Stop 1 departure').fill('10:00');
  assert.equal(await page.getByLabel('Stop 1 departure').inputValue(), '10:00');
  await page.locator('#origin-input').fill('16.306700,80.436500');
  for (let i = 1; i <= 3; i += 1) {
    await page.getByLabel('Stop ' + i + ' name').fill('Stop ' + i);
    await page.getByLabel('Stop ' + i + ' destination').fill('16.' + (306700 + i * 100) + ',80.4' + (36500 + i * 120));
  }
  // Mark typed stops on the live map without running a demo/analysis.
  await page.waitForTimeout(1900);
  assert(await page.locator('.raster-stop-marker.preview').count() >= 3,
    'typing places must create map preview markers before analysis');
  assert((await page.locator('.raster-route-preview').getAttribute('d') || '').length > 12,
    'ordered stop locations must produce a labeled preliminary route');
  assert(!await page.locator('.itinerary-submit').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return style.position === 'sticky' || style.position === 'fixed';
  }), 'Review journeys must stay in form flow, never float over stops');
  assert(await page.locator('.top-environment .env-chip').count() >= 3,
    'editing origin must not reset environmental chips to CONNECTING');
  assert(await page.getByRole('button', { name: 'Review journeys' }).isEnabled(),
    'valid timed three-stop schedule must enable Review journeys');
  await page.getByRole('button', { name: 'Review journeys' }).click();
  assert(await page.getByRole('button', { name: 'Analyze & optimize my day' }).isVisible(),
    'timed multi-stop itinerary must advance to analysis review');
  await page.getByRole('button', { name: 'Back', exact: false }).first().click();
  assert.equal(await page.locator('.itinerary-stop').count(), 3, 'returning from review must preserve stops');

  for (let i = 1; i <= 3; i += 1) {
    assert(await page.getByRole('textbox', { name: 'Stop ' + i + ' name' }).isVisible(),
      'stop ' + i + ' needs an editable name');
    assert(await page.getByLabel('Stop ' + i + ' arrival').isVisible(),
      'stop ' + i + ' needs a scheduled arrival');
  }
  await check('multi-stop editor');

  for (const tab of ['Today', 'Optimize', 'Impact', 'India', 'History', 'Settings', 'Today']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await check(tab + ' tab');
  }
  // Reload clears an unsubmitted planner draft before exercising the demo entry point.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await check('fresh home before demo');
  await page.getByRole('button', { name: 'Load Demo Route' }).click();
  await page.waitForSelector('.raster-stop-marker', { timeout: 15000 });
  assert(await page.locator('.raster-stop-marker').count() >= 2, 'analyzed trips must display real stop markers');
  assert((await page.locator('.raster-route-optimized').first().getAttribute('d') || '').length > 20,
    'analyzed trips must include actual route coordinates');
  await page.locator('.raster-stop-marker').last().click();
  assert(await page.locator('.raster-stop-detail').isVisible(), 'stop click must show details');
  await check('analyzed demo route');
  await page.screenshot({ path: '/tmp/pollution-demo-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await check('mobile layout', true);
  await page.screenshot({ path: '/tmp/pollution-home-mobile.png', fullPage: true });
  assert(errors.length === 0, 'Browser JS exceptions: ' + errors.join('; '));
  console.log('Browser smoke PASSED: 6 hard reloads, delayed data responses, real map sizing and tiles, 3 stops, 7 nav screens, route markers/clicks, mobile rendering; environmental requests=' + envCalls);
} finally {
  await browser.close();
}
