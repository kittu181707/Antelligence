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
const sentAnalyses = [];
let rejectNextLiveAnalysis = true;
try {
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 },
    geolocation: { latitude: origin.lat, longitude: origin.lon },
    permissions: ['geolocation'],
    serviceWorkers: 'block',
  });
  // Deterministic 3x3 Open-Meteo values exercise the weather renderer in
  // browser QA; production never substitutes fixtures for weather.
  await context.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url());
    const locations = (url.searchParams.get('latitude') || '').split(',').length;
    const readings = Array.from({ length: locations }, (_, i) => ({
      current: { temperature_2m: 26 + i * .75 },
    }));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(readings) });
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
    else if (path.endsWith('/api/day/analyze')) {
      const submitted = JSON.parse(route.request().postData() || '{}');
      sentAnalyses.push(submitted);
      if (!submitted.demoMode) {
        // Browser tests prove the modal persists while a real request is pending,
        // animates through stages, and disappears on both success and failure.
        await new Promise((resolve) => setTimeout(resolve, 4500));
        if (rejectNextLiveAnalysis) {
          rejectNextLiveAnalysis = false;
          await route.fulfill({ status: 503, contentType: 'application/json',
            body: JSON.stringify({ message: 'Temporary routing outage. Try again.' }) });
          return;
        }
      }
      payload = analysis;
    }
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

  // Preserve the identity without a pasted PNG background, at every viewport.
  // The wordmark is live text, aligned above the tagline beside the vector A.
  const assertCompactHeader = async (label) => {
    const layout = await page.evaluate(() => {
      const header = document.querySelector('.app-topbar');
      const title = document.querySelector('.app-welcome h1');
      const lettering = title?.querySelector('.ant-brand-wordmark');
      const subtitle = document.querySelector('.app-welcome .ant-brand-copy p');
      const emblem = document.querySelector('.ant-brand-emblem');
      const welcome = document.querySelector('.app-welcome');
      const environment = document.querySelector('.top-environment');
      if (!header || !title || !lettering || !subtitle || !emblem || !welcome || !environment) return null;
      const emblemRect = emblem.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const subtitleRect = subtitle.getBoundingClientRect();
      const welcomeRect = welcome.getBoundingClientRect();
      const envRect = environment.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        emblemWidth: emblemRect.width,
        emblemHeight: emblemRect.height,
        emblemLoaded: emblem.complete && emblem.naturalWidth > 0,
        emblemDecorative: emblem.getAttribute('alt') === '' && emblem.getAttribute('aria-hidden') === 'true',
        titleLabel: title.getAttribute('aria-label'),
        wordmark: lettering.textContent?.trim(),
        wordmarkIsText: lettering.tagName === 'SPAN',
        titleWidth: titleRect.width,
        tagline: subtitle.textContent?.trim(),
        taglineAligned: Math.abs(subtitleRect.left - titleRect.left) <= 4,
        taglineLines: subtitleRect.height / parseFloat(getComputedStyle(subtitle).lineHeight),
        headerHeight: header.getBoundingClientRect().height,
        horizontalOverflow: header.scrollWidth > header.clientWidth + 2,
        overlaps: window.innerWidth > 760
          ? welcomeRect.right > envRect.left + 2
          : welcomeRect.bottom > envRect.top + 2,
        chips: environment.querySelectorAll('.env-chip').length,
        rasterWordmark: !!document.querySelector('img.ant-brand-wordmark, img[src="/antelligence-wordmark.png"]'),
      };
    });
    assert(layout && layout.chips >= 5,
      label + ': test requires populated live environment chips: ' + JSON.stringify(layout));
    assert.equal(layout.titleLabel, 'Antelligence', label + ': brand needs a complete accessible name');
    assert.equal(layout.wordmark, 'ntelligence', label + ': original lowercase lettering missing');
    assert.equal(layout.tagline, 'Intelligence through coordination', label + ': brand tagline changed');
    assert(layout.emblemLoaded && layout.emblemDecorative && layout.wordmarkIsText &&
      layout.emblemWidth >= 68 && layout.emblemWidth <= 90 &&
      layout.emblemHeight >= 65 && layout.emblemHeight <= 92 &&
      layout.titleWidth >= 125 && layout.titleWidth <= 240 &&
      layout.taglineAligned && layout.taglineLines <= 1.08 && !layout.rasterWordmark,
      label + ': vector emblem, live text and left-aligned tagline must form one brand: ' + JSON.stringify(layout));
    assert(!layout.horizontalOverflow && !layout.overlaps,
      label + ': live weather and AQI chips must remain unobstructed: ' + JSON.stringify(layout));
    if (layout.viewport >= 1024) {
      assert(layout.headerHeight <= 112,
        label + ': header is too tall for the dashboard: ' + JSON.stringify(layout));
    }
  };

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await check('initial home');
  assert.equal(await page.locator('.compact-map-head h2').textContent(), 'AWS routes',
    'shared map title must name the AWS routing service');
  assert.equal(await page.locator('.raster-map-badge').textContent(), 'OSM map',
    'unplanned map must not claim AWS supplies the basemap');
  assert(await page.locator('.raster-attribution').getByText('OpenStreetMap').isVisible(),
    'OpenStreetMap tile attribution must remain visible');
  assert((await page.locator('.landing-provenance').textContent() || '').includes('Amazon Location · Lambda · Step Functions'),
    'existing landing provenance must retain accurate AWS names (compact desktop CSS hides this footer)');
  // A weather model field must be fetched, interpolated, labeled and
  // removable without destroying the underlying navigation/route map.
  await page.waitForSelector('[data-weather-heatmap="ready"]', { timeout: 12000 });
  assert.equal(await page.locator('.weather-temperature-readout strong').textContent(), '29°C',
    'temperature overlay must use actual sampled model data near map center');
  assert(await page.locator('.weather-temperature-legend').isVisible(),
    'weather overlay needs a visible Celsius scale and data attribution');
  const firstTile = page.locator('.raster-tile').first();
  assert(await firstTile.evaluate((el) => Math.abs(el.getBoundingClientRect().width - 128) <= 2),
    'compact map should use sharper half-size, next-zoom native tiles');
  await page.locator('.raster-layer-switch').getByRole('button', { name: 'Routes' }).click();
  assert.equal(await page.locator('[data-weather-heatmap="ready"]').count(), 0,
    'Routes display must remove heat overlay without losing the underlying map');
  assert.equal(await page.locator('[data-map-engine="dom-raster"]').count(), 1,
    'weather switch must preserve the working map engine');
  await page.locator('.raster-layer-switch').getByRole('button', { name: 'Temperature' }).click();
  await page.waitForSelector('[data-weather-heatmap="ready"]', { timeout: 12000 });
  // Judge-facing homepage: wider map on the RIGHT without increasing its height.
  assert(await page.locator('.landing-dashboard .landing-hero').isVisible(), 'landing page needs a visible product hero');
  assert.equal(await page.locator('.landing-method-card').count(), 3, 'explain the product in three credible steps');
  assert(await page.getByRole('button', { name: 'Enter your day' }).isVisible(), 'primary planning action absent');
  assert(await page.getByRole('button', { name: 'Try judge demo · 1 click' }).isVisible(), 'working demo action absent');
  const heroRect = await page.locator('.landing-hero').boundingBox();
  const landingMapRect = await page.locator('.compact-map-frame').boundingBox();
  assert(heroRect && landingMapRect && landingMapRect.width >= 400,
    'judge-facing map must be wider than the previous 342px frame: ' + JSON.stringify(landingMapRect));
  assert(Math.abs(landingMapRect.height - 235) <= 2,
    'landing map must stay compact: ' + JSON.stringify(landingMapRect));
  assert(landingMapRect.x >= heroRect.x + heroRect.width + 9,
    'landing map must occupy its own right column without overlapping the hero');
  assert(await page.locator('.landing-hero').getByText('modeled air quality', { exact: false }).isVisible(),
    'visible landing hero must identify model data without assuming measured personal exposure');
  assert.equal(await page.locator('.bottom-nav button').count(), 3,
    'dock must contain only Today, Map and Settings');
  assert.deepEqual(await page.locator('.bottom-nav button span').allTextContents(),
    ['Today', 'Map', 'Settings'], 'three-tab navigation labels changed');
  assert(await page.getByText('Google / Apple Calendar · export an .ics file').isVisible(),
    'calendar import must identify supported .ics exports, not claim OAuth connection');
  const calendarHintBounds = await page.locator('.landing-calendar-hint').boundingBox();
  const calendarButtonBounds = await page.locator('.landing-import').boundingBox();
  const demoButtonBounds = await page.locator('.landing-demo').boundingBox();
  assert(calendarHintBounds && calendarButtonBounds && demoButtonBounds &&
    calendarHintBounds.y >= calendarButtonBounds.y + calendarButtonBounds.height - 3 &&
    Math.abs(calendarHintBounds.x + calendarHintBounds.width / 2 -
      (calendarButtonBounds.x + calendarButtonBounds.width / 2)) <= 10 &&
    calendarHintBounds.x >= demoButtonBounds.x + demoButtonBounds.width - 5,
    'Google / Apple hint must sit immediately beneath Import calendar (not beneath the judge demo)');

  assert(await page.getByRole('button', { name: 'Try judge demo · 1 click' }).isVisible(),
    'one-click judge demo must be clearly discoverable');
  assert(await page.getByRole('button', { name: 'Enter your day' }).isVisible(),
    'primary action must say Enter your day');
  const methodRect = await page.locator('.landing-method').boundingBox();
  assert(methodRect && methodRect.x <= heroRect.x + 2 &&
    methodRect.width > heroRect.width + landingMapRect.width * .70,
    'three step cards must span below BOTH the hero and map');
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.waitForTimeout(250);
  const viewportResult = await page.evaluate(() => {
    const main = document.querySelector('.landing-layout');
    const cards = document.querySelector('.landing-method-grid');
    const nav = document.querySelector('.bottom-nav');
    const map = document.querySelector('.compact-map-frame');
    const hero = document.querySelector('.landing-hero');
    const pos = (el) => el?.getBoundingClientRect();
    return {
      scrollHeight: main?.scrollHeight, clientHeight: main?.clientHeight,
      cards: pos(cards), nav: pos(nav), map: pos(map), hero: pos(hero),
    };
  });
  assert(viewportResult.scrollHeight <= viewportResult.clientHeight + 2,
    'desktop homepage must not require vertical scrolling: ' + JSON.stringify(viewportResult));
  assert(viewportResult.cards && viewportResult.nav &&
    viewportResult.cards.bottom <= viewportResult.nav.top - 8,
    'landing cards must fit above floating navigation at 1280×640: ' + JSON.stringify(viewportResult));
  assert(viewportResult.map && viewportResult.map.height <= 222,
    'short desktop map must become compact vertically');
  await page.screenshot({ path: '/tmp/pollution-landing-short-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.waitForTimeout(180);
  // Pointer capture emits a click when a drag ends. The compact map must
  // PAN without opening the full-page map, even when the mouse is released.
  const compactFrame = page.locator('.compact-map-frame');
  const compactRect = await compactFrame.boundingBox();
  assert(compactRect, 'compact map must have measurable bounds before dragging');
  const dragStart = { x: compactRect.x + compactRect.width * .47,
    y: compactRect.y + compactRect.height * .55 };
  const gpsDot = compactFrame.locator('.raster-you');
  await gpsDot.waitFor({ state: 'visible', timeout: 10000 });
  const dotBefore = await gpsDot.boundingBox();
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 72, dragStart.y - 24, { steps: 7 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.fullpage-map-screen').count(), 0,
    'dragging the small map must never open the full-page map');
  const dotAfter = await gpsDot.boundingBox();
  assert(dotBefore && dotAfter && Math.abs(dotAfter.x - dotBefore.x) > 30,
    'dragging should visibly pan the map rather than swallow the gesture');

  await page.getByRole('button', { name: 'Expand map to full page' }).click();
  assert(await page.locator('.fullpage-map-screen').isVisible(),
    'the small map header must open full-page route map');
  assert.equal(await page.locator('.fullpage-map-header h2').textContent(), 'AWS route view',
    'full-page map must identify AWS routing without implying AWS basemap tiles');
  assert(await page.getByRole('button', { name: 'Map', exact: true }).getAttribute('aria-current') === 'page',
    'expanding map must highlight Map tab');
  await page.evaluate(() => window.history.back());
  await page.locator('.landing-hero').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Today', exact: true }).getAttribute('aria-current'), 'page',
    'browser Back must restore Today after expanding the map');
  await page.evaluate(() => window.history.forward());
  await page.locator('.fullpage-map-screen').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Map', exact: true }).getAttribute('aria-current'), 'page',
    'browser Forward must reopen the full-page map');
  await page.getByRole('button', { name: 'Back to Today' }).click();
  assert(await page.locator('.landing-hero').isVisible(), 'Back to Today should restore original landing');
  await page.locator('.compact-map-frame').click({ position: { x: 30, y: 85 } });
  assert(await page.locator('.fullpage-map-screen').isVisible(),
    'clicking map tile itself must also open the full-page map');
  await page.getByRole('button', { name: 'Back to Today' }).click();

  // Browser history must also handle navigation tabs and the edit flow
  // without losing the pending itinerary.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).getAttribute('aria-current'), 'page');
  assert.equal(await page.evaluate(() => location.hash), '#/settings/landing',
    'Settings must have its own browser-history address');
  const beforeSettingsBack = await page.evaluate(() => ({ state: history.state?.pollutionView, length: history.length }));
  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(450);
  const afterSettingsBack = await page.evaluate(() => ({
    state: history.state?.pollutionView,
    length: history.length,
    active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent,
    hasLandingHero: !!document.querySelector('.landing-hero'),
  }));
  console.log('Settings Back diagnostics:', JSON.stringify({ beforeSettingsBack, afterSettingsBack }));
  await page.locator('.landing-hero').waitFor({ state: 'visible', timeout: 3500 });
  // Going Back must not create a new history entry and erase Forward.
  assert.equal(await page.evaluate(() => location.hash), '#/today/landing',
    'Back must restore the distinct Today history URL');
  assert.equal(await page.evaluate(() => history.state?.pollutionView?.tab), 'today',
    'Back must restore the Today history entry');
  await page.evaluate(() => window.history.forward());
  await page.waitForTimeout(500);
  const afterSettingsForward = await page.evaluate(() => ({
    state: history.state?.pollutionView,
    active: document.querySelector('.bottom-nav [aria-current="page"]')?.textContent,
    hasLandingHero: !!document.querySelector('.landing-hero'),
    readyState: document.readyState,
  }));
  console.log('Settings Forward diagnostics:', JSON.stringify(afterSettingsForward));
  await page.waitForFunction(() =>
    document.querySelector('.bottom-nav button[aria-current="page"]')?.textContent?.includes('Settings'),
    undefined, { timeout: 3500 });
  assert.equal(await page.evaluate(() => location.hash), '#/settings/landing',
    'Forward must restore the distinct Settings history URL');
  assert.equal(await page.evaluate(() => history.state?.pollutionView?.tab), 'settings',
    'Forward must retain and restore the Settings history entry');
  assert.equal(await page.getByRole('button', { name: 'Settings', exact: true }).getAttribute('aria-current'), 'page',
    'browser Forward must restore Settings');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Enter your day' }).click();
  await page.locator('.itinerary-editor').waitFor({ state: 'visible' });
  await page.evaluate(() => window.history.back());
  await page.locator('.landing-hero').waitFor({ state: 'visible' });
  await page.evaluate(() => window.history.forward());
  await page.locator('.itinerary-editor').waitFor({ state: 'visible' });
  await page.locator('.itinerary-editor .back').click();
  await page.locator('.landing-hero').waitFor({ state: 'visible' });
  await page.screenshot({ path: '/tmp/pollution-landing-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  const tabletMap = await page.locator('.compact-map-frame').boundingBox();
  assert(tabletMap && tabletMap.width >= 320 && Math.abs(tabletMap.height - 235) <= 2,
    'tablet map should remain wide and 235px tall');
  assert(await page.locator('.landing-hero').isVisible(), 'tablet pitch should render');
  await page.screenshot({ path: '/tmp/pollution-landing-tablet.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const smallMap = await page.locator('.compact-map-frame').boundingBox();
  assert(smallMap && smallMap.width >= 280 && smallMap.height <= 232,
    'mobile map should stack and retain compact 230px height');
  assert(await page.locator('.landing-primary').isVisible(), 'mobile main CTA must remain available');
  assert.equal(await page.locator('.landing-method-card').count(), 3, 'mobile product explanation should stack');
  await page.screenshot({ path: '/tmp/pollution-landing-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.waitForTimeout(200);
  await page.waitForSelector('[data-map-ready="true"]', { timeout: 15000 });
  // Remain completely idle during initial delayed GPS/environment update window.
  await page.waitForTimeout(5000);
  await check('six-second untouched home');
  for (const width of [1365, 1280, 1024, 900, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
    await assertCompactHeader('live environment at ' + width + 'px');
  }
  await page.setViewportSize({ width: 1365, height: 768 });
  // All main pages reuse this header, so also protect against tab-specific overrides.
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await assertCompactHeader('Map tab with loaded live conditions');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await assertCompactHeader('Settings tab with loaded live conditions');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await assertCompactHeader('Today tab after navigation');
  await page.screenshot({ path: '/tmp/pollution-home-desktop.png', fullPage: true });

  for (let i = 0; i < 6; i += 1) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1700);
    await check('hard-refresh ' + (i + 1));
  }
  const input = page.getByRole('button', { name: 'Enter your day' });
  await input.click();
  // At a judge's laptop viewport, the day planner must not scroll as a whole.
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.waitForTimeout(250);
  const plannerLayout = await page.evaluate(() => {
    const main = document.querySelector('.planner-layout');
    const map = document.querySelector('.planner-layout .compact-map-frame');
    const back = document.querySelector('.planner-layout .itinerary-editor .back');
    const heading = document.querySelector('.planner-layout .screen-title');
    const review = document.querySelector('.planner-map-review-button');
    const mapCard = document.querySelector('.planner-layout .compact-map-card');
    const leftSubmit = document.querySelector('.planner-layout .itinerary-submit');
    const dock = document.querySelector('.bottom-nav');
    const box = (element) => element?.getBoundingClientRect().toJSON();
    return {
      scrollHeight: main?.scrollHeight, clientHeight: main?.clientHeight,
      map: box(map), mapCard: box(mapCard), back: box(back), heading: box(heading),
      review: box(review), dock: box(dock),
      leftSubmitDisplay: leftSubmit ? getComputedStyle(leftSubmit).display : null,
    };
  });
  assert(plannerLayout.map && plannerLayout.map.width >= 400 &&
    plannerLayout.map.height <= 222,
    'planner map must match landing page width and short-screen height: ' + JSON.stringify(plannerLayout));
  assert(plannerLayout.scrollHeight <= plannerLayout.clientHeight + 2,
    'desktop planner must not have an outer vertical scrollbar: ' + JSON.stringify(plannerLayout));
  assert(plannerLayout.back && plannerLayout.heading &&
    plannerLayout.back.x < plannerLayout.heading.x + 10 &&
    plannerLayout.back.bottom <= plannerLayout.heading.top + 1,
    'Back button must stay top left above Plan your day: ' + JSON.stringify(plannerLayout));
  assert(plannerLayout.review && plannerLayout.mapCard &&
    plannerLayout.review.top >= plannerLayout.mapCard.bottom &&
    plannerLayout.review.left >= plannerLayout.mapCard.left - 2 &&
    plannerLayout.review.right <= plannerLayout.mapCard.right + 2,
    'Analyze must stay directly BELOW the right-hand map: ' + JSON.stringify(plannerLayout));
  assert(plannerLayout.review && plannerLayout.dock &&
    plannerLayout.review.bottom <= plannerLayout.dock.top - 7,
    'Review must never be covered by the bottom navigation: ' + JSON.stringify(plannerLayout));
  assert(plannerLayout.leftSubmitDisplay === 'none',
    'desktop planner must not show a second Review button on the left');
  await page.screenshot({ path: '/tmp/pollution-planner-empty-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1365, height: 768 });

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
  // All planner content, from heading to final stop, scrolls as ONE left panel.
  // The right map and its Review action must remain fixed and unobscured.
  await page.setViewportSize({ width: 1280, height: 640 });
  for (let index = 3; index < 12; index++) {
    await page.getByRole('button', { name: 'Add another stop' }).click();
  }
  assert.equal(await page.locator('.itinerary-stop').count(), 12, 'maximum of twelve stops must remain supported');
  // Clicking Add another stop scrolls the *whole* left column into view.
  // Return to the top before measuring a deliberate 360px pane scroll.
  await page.evaluate(() => {
    const panel = document.querySelector('.planner-layout .global-panel-col');
    if (panel) panel.scrollTop = 0;
  });
  const overflow = await page.evaluate(() => {
    const main = document.querySelector('.planner-layout');
    const panel = document.querySelector('.planner-layout .global-panel-col');
    const list = document.querySelector('.planner-layout .itinerary-list');
    const review = document.querySelector('.planner-map-review-button');
    const mapCard = document.querySelector('.planner-layout .compact-map-card');
    const nav = document.querySelector('.bottom-nav');
    const back = document.querySelector('.planner-layout .itinerary-editor .back');
    const pos = (element) => element?.getBoundingClientRect().toJSON();
    return {
      outerScroll: main?.scrollHeight, outerHeight: main?.clientHeight,
      panelScroll: panel?.scrollHeight, panelHeight: panel?.clientHeight,
      panelOverflowY: panel ? getComputedStyle(panel).overflowY : null,
      listScroll: list?.scrollHeight, listHeight: list?.clientHeight,
      listOverflowY: list ? getComputedStyle(list).overflowY : null,
      map: pos(mapCard), review: pos(review), nav: pos(nav), back: pos(back),
    };
  });
  assert(overflow.outerScroll <= overflow.outerHeight + 2 &&
    overflow.panelScroll > overflow.panelHeight + 300 &&
    overflow.panelOverflowY === 'auto' &&
    overflow.listOverflowY === 'visible' &&
    overflow.listScroll <= overflow.listHeight + 2 &&
    overflow.review.bottom < overflow.nav.top - 5,
    'all 12 stops must use the full LEFT scroll pane; map and Review remain fixed: ' + JSON.stringify(overflow));
  const scrollState = await page.evaluate(() => {
    const panel = document.querySelector('.planner-layout .global-panel-col');
    panel.scrollTop = 360;
    const pos = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
    return {
      scrollTop: panel.scrollTop,
      back: pos('.planner-layout .itinerary-editor .back'),
      map: pos('.planner-layout .compact-map-card'),
      review: pos('.planner-map-review-button'),
    };
  });
  assert(scrollState.scrollTop >= 200 &&
    scrollState.back.top < overflow.back.top - 170 &&
    Math.abs(scrollState.map.top - overflow.map.top) <= 2 &&
    Math.abs(scrollState.review.top - overflow.review.top) <= 2,
    'scrolling the LEFT planner must move its heading while map and Review remain stationary: ' + JSON.stringify(scrollState));
  await page.screenshot({ path: '/tmp/pollution-planner-left-scroll-desktop.png', fullPage: true });
  await page.getByLabel('Remove stop 12').click();
  for (let index = 11; index >= 4; index--) {
    await page.getByLabel('Remove stop ' + index).click();
  }
  assert.equal(await page.locator('.itinerary-stop').count(), 3, 'removing extras must preserve first three stops');
  await page.screenshot({ path: '/tmp/pollution-planner-stops-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 1365, height: 768 });

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
  // Transportation setup is part of stop editing, not another review page.
  assert.equal(await page.locator('.planner-travel-settings').count(), 4,
    'three stops and the return home leg must have inline travel controls');
  assert(await page.getByRole('button', { name: 'Stop 1 by Car' }).getAttribute('aria-pressed') === 'true',
    'new stops must default to Car');
  assert(await page.getByRole('button', { name: 'Stop 1 by Bike' }).isEnabled(),
    'Bike must be available in live travel mode');
  await page.getByRole('button', { name: 'Stop 1 by Bike' }).click();
  assert(await page.getByText('Cycling access and road safety are not verified.', { exact: false }).isVisible(),
    'Bike must disclose that estimates use unverified pedestrian routing');
  assert(await page.getByRole('button', { name: 'Stop 1 by Bike' }).getAttribute('aria-pressed') === 'true',
    'per-leg travel modes must be editable in the stop form');
  await page.getByLabel('Stop 1 travel departure').fill('08:10');
  await page.getByRole('button', { name: 'Return home by Bike' }).click();
  await page.getByRole('button', { name: '+15 min' }).click();
  assert(await page.getByRole('button', { name: '+15 min' }).getAttribute('aria-pressed') === 'true',
    'extra-travel budget must be adjustable inline');
  assert(!await page.getByText('Review your journeys', { exact: true }).count(),
    'the separate travel review screen must no longer exist');
  assert(await page.locator('.planner-map-review-button').isEnabled(),
    'valid stops must enable direct analysis');
  assert(await page.locator('.planner-map-review-button').getByText('Analyze & optimize my day').isVisible(),
    'right-map action must say Analyze & optimize my day, not Review journeys');
  assert.equal(await page.locator('.planner-travel-budget').count(), 1,
    'extra-travel budget must be available in the original stops page');
  for (let i = 1; i <= 3; i += 1) {
    assert(await page.getByRole('textbox', { name: 'Stop ' + i + ' name' }).isVisible(),
      'stop ' + i + ' needs an editable name');
    assert(await page.getByLabel('Stop ' + i + ' arrival').isVisible(),
      'stop ' + i + ' needs a scheduled arrival');
  }
  await check('multi-stop editor');

  // Map must be a true full-page map and active highlight must follow it.
  await page.waitForFunction(() =>
    document.querySelectorAll('.raster-stop-marker.preview').length >= 3, null, { timeout: 5000 });
  assert.equal(await page.locator('.raster-map-badge').textContent(), 'AWS places',
    'geocoded previews must name the actual Amazon Location Places capability');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  assert(await page.locator('.fullpage-map-screen').isVisible(), 'Map tab must expand shared map to full-page view');
  assert.equal(await page.locator('[data-map-engine="dom-raster"]').count(), 1,
    'full-page map must use one stable map instance, not overlapping duplicates');
  await page.waitForFunction(() =>
    document.querySelectorAll('.fullpage-map-screen .raster-stop-marker.preview').length >= 3,
    null, { timeout: 8000 });
  assert(await page.locator('.fullpage-map-screen .raster-stop-marker.preview').count() >= 3,
    'full-page map should preserve draft preview markers after resizing and re-fitting');
  const fullBounds = await page.locator('.fullpage-map-canvas').boundingBox();
  assert(fullBounds && fullBounds.width >= 1000 && fullBounds.height >= 350,
    'full-page map must occupy available content area: ' + JSON.stringify(fullBounds));
  assert(await page.getByRole('button', { name: 'Map', exact: true }).getAttribute('aria-current') === 'page',
    'Map tab must be highlighted when map page is visible');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  assert.equal(await page.locator('.itinerary-stop').count(), 3,
    'returning from Map must preserve the planner and entered stops');
  assert(await page.getByRole('button', { name: 'Today', exact: true }).getAttribute('aria-current') === 'page',
    'Today tab must be highlighted on returning to planner');
  await check('returned planner with map state preserved');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await check('Settings tab');
  assert(await page.getByRole('button', { name: 'Settings', exact: true }).getAttribute('aria-current') === 'page',
    'Settings tab must be highlighted on the Settings page');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await check('Today tab');
  assert(await page.getByRole('button', { name: 'Stop 1 by Bike' }).getAttribute('aria-pressed') === 'true',
    'travel settings must survive Map and Settings navigation');
  assert.equal(await page.getByLabel('Stop 1 travel departure').inputValue(), '08:10',
    'custom departure must survive navigation');
  // A failed AWS analysis must leave the input form editable, not navigate to a
  // loading page or strand the user under a permanent blurred overlay.
  const beforeLiveAnalyze = sentAnalyses.length;
  await page.locator('.planner-map-review-button').click();
  const overlay = page.locator('[data-analysis-overlay]');
  await overlay.waitFor({ state: 'visible', timeout: 4000 });
  assert(await page.locator('.planner-layout .itinerary-editor').count() === 1,
    'planner must remain mounted behind the loading overlay');
  assert.equal(await overlay.getAttribute('role'), 'dialog');
  assert.equal(await overlay.getAttribute('aria-modal'), 'true');
  // Observe the short-lived check immediately. Expensive layout/animation
  // assertions below should not miss it while the mocked API is pending.
  const firstStage = await overlay.locator('.analysis-single-step strong').textContent();
  const firstIndex = Number(await overlay.locator('[data-analysis-step]').getAttribute('data-stage-index'));
  await overlay.locator('[data-analysis-tick]').waitFor({ state: 'visible', timeout: 2800 });
  await page.waitForFunction((previous) =>
    Number(document.querySelector('[data-analysis-step]')?.getAttribute('data-stage-index')) > previous,
    firstIndex, { timeout: 3000 });
  const laterStage = await overlay.locator('.analysis-single-step strong').textContent();
  assert(firstStage !== laterStage, 'the checked step must disappear and next step take its place');
  assert.equal(await overlay.locator('.analysis-overlay-card').count(), 0,
    'analysis must not appear inside the old white login-style card');
  assert.equal(await overlay.locator('.analysis-orbit-leaf').count(), 1,
    'only the central leaf should appear in the orbit animation');
  assert.equal(await overlay.locator('.analysis-orbit-circle').count(), 3,
    'the central leaf should be surrounded by three rotating rings');
  assert.equal(await overlay.locator('.analysis-orbit-object').count(), 3,
    'three small route, weather, and leaf icons should orbit around the central leaf');
  for (const ring of ['one', 'two', 'three']) {
    assert.equal(await overlay.locator('.analysis-orbit-circle.orbit-' + ring + ' > .analysis-orbit-object').count(), 1,
      'each rotating circle must carry exactly one orbiting icon');
  }
  const orbitStart = await overlay.locator('.orbit-one .analysis-orbit-object').boundingBox();
  await page.waitForTimeout(220);
  const orbitEnd = await overlay.locator('.orbit-one .analysis-orbit-object').boundingBox();
  assert(orbitStart && orbitEnd && Math.hypot(orbitEnd.x - orbitStart.x, orbitEnd.y - orbitStart.y) > 3,
    'the small icon must actually move along its circular path, not just float in place');
  assert.equal(await overlay.locator('[data-analysis-step]').count(), 1,
    'only one current step should be rendered');
  const visuals = await overlay.evaluate((element) => {
    const content = element.querySelector('.analysis-overlay-content');
    const ring = element.querySelector('.analysis-orbit-circle');
    const screen = getComputedStyle(element);
    const contentStyle = getComputedStyle(content);
    const ringStyle = getComputedStyle(ring);
    return {
      blurred: screen.backdropFilter.includes('blur') || screen.webkitBackdropFilter.includes('blur'),
      panelTransparent: contentStyle.backgroundColor === 'rgba(0, 0, 0, 0)',
      panelBorder: contentStyle.borderTopWidth,
      ringAnimation: ringStyle.animationName,
      ringsInfinite: [...element.querySelectorAll('.analysis-orbit-circle')].every((item) =>
        getComputedStyle(item).animationIterationCount === 'infinite'),
      iconsInfinite: [...element.querySelectorAll('.analysis-orbit-object')].every((item) =>
        getComputedStyle(item).animationIterationCount === 'infinite'),
      viewport: Math.abs(element.getBoundingClientRect().height - window.innerHeight) < 2,
    };
  });
  assert(visuals.blurred && visuals.panelTransparent && visuals.panelBorder === '0px' &&
    visuals.viewport && visuals.ringAnimation === 'analysis-spin' &&
    visuals.ringsInfinite && visuals.iconsInfinite,
    'full-screen blurred backdrop, transparent center and moving rings required: ' + JSON.stringify(visuals));
  assert.equal(await overlay.locator('[data-analysis-step]').count(), 1,
    'tick must appear in the same step instead of a multi-step list');
  await page.screenshot({ path: '/tmp/pollution-analysis-overlay.png', fullPage: true });
  await overlay.waitFor({ state: 'detached', timeout: 9000 });
  assert(await page.locator('.itinerary-editor .error-banner').getByText('Temporary routing outage.', { exact: false }).isVisible(),
    'a real service error should return to the planner and explain the failure');
  assert.equal(await page.locator('.itinerary-stop').count(), 3,
    'failed analysis must retain all three stops');
  assert.equal(await page.getByLabel('Stop 1 travel departure').inputValue(), '08:10',
    'failed analysis must retain custom departure');

  // Reproduce the reported bug: leave the planner scrolled deep immediately
  // before transitioning to the completed analysis dashboard.
  await page.locator('.planner-layout .global-panel-col').evaluate((panel) => { panel.scrollTop = 260; });
  const plannerScrollBeforeResult = await page.locator('.planner-layout .global-panel-col').evaluate((panel) => panel.scrollTop);
  assert(plannerScrollBeforeResult > 20, 'scroll-reset test needs a genuinely scrolled planner');
  await page.locator('.planner-map-review-button').click();
  await overlay.waitFor({ state: 'visible', timeout: 4000 });
  await page.waitForSelector('.raster-route-optimized', { timeout: 15000 });
  await overlay.waitFor({ state: 'detached', timeout: 4000 });
  assert(sentAnalyses.length === beforeLiveAnalyze + 2,
    'a failed attempt followed by a retry must produce exactly two live API calls');
  const submitted = sentAnalyses.at(-1);
  assert(submitted.demoMode === false && submitted.maxExtraMinutes === 15,
    'one-page analysis must send the selected live optimization budget');
  assert.equal(submitted.journeys.length, 4, 'analysis should include 3 arrivals and return leg');
  assert.equal(submitted.journeys[0].mode, 'bike', 'Bike mode must reach the backend');
  assert.equal(submitted.journeys[0].departureTime, '08:10', 'custom departure must reach backend');
  assert.equal(submitted.journeys[3].mode, 'bike', 'Return-home Bike mode must reach backend');
  assert(!await page.getByText('Review your journeys', { exact: true }).count(),
    'direct analysis must never display an intermediate review page');
  assert(!await page.locator('.analysis-overlay').count(),
    'results must dismiss the overlay and display the results without loading-page navigation');
  assert.equal(await page.locator('.results-layout .global-panel-col').evaluate((panel) => panel.scrollTop), 0,
    'analyzed Today must open at the top even when the planner was scrolled');
  assert.equal(await page.locator('.results-layout').evaluate((main) => main.scrollTop), 0,
    'the shared main scrollport must also reset on entering analyzed Today');
  assert(await page.getByRole('button', { name: 'See a sample with real changes' }).isVisible(),
    'when verified live changes are absent, users must be offered a clearly labeled working demonstration');
  await check('direct live Bike Analyze from stop editor');
  assert.equal(await page.locator('.raster-map-badge').textContent(), 'AWS routes',
    'live analyzed geometries must identify Amazon Location Routes');
  assert(await page.locator('.raster-attribution').getByText('OpenStreetMap').isVisible(),
    'AWS-routed journeys still require OpenStreetMap basemap credit');
  // Reload clears an unsubmitted planner draft before exercising the demo entry point.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await check('fresh home before demo');
  await page.getByRole('button', { name: 'Try judge demo · 1 click' }).click();
  await page.waitForSelector('.raster-stop-marker', { timeout: 15000 });
  assert(await page.locator('.raster-stop-marker').count() >= 2, 'analyzed trips must display real stop markers');
  assert((await page.locator('.raster-route-optimized').first().getAttribute('d') || '').length > 20,
    'analyzed trips must include actual route coordinates');
  await page.locator('.raster-stop-marker').last().click();
  assert(await page.locator('.raster-stop-detail').isVisible(), 'stop click must show details');
  await check('analyzed demo route');
  assert.equal(await page.locator('.compact-map-head h2').textContent(), 'Demo map',
    'controlled demo must not claim its simulated routes are live AWS routes');
  assert.equal(await page.locator('.raster-map-badge').textContent(), 'Demo · OSM',
    'demo badge must preserve OSM attribution rather than mislabel sample routes');
  // Results use a dedicated left scrollport: scrolling journey cards must never
  // move the interactive map, and the dock must not obscure the last card.
  assert(await page.locator('.results-layout .results-timeline').isVisible(),
    'analyzed Today needs the styled journey timeline');
  assert(await page.locator('.results-impact-panel').isVisible(),
    'impact summary must appear under the map instead of under the navigation dock');
  const resultsScroll = page.locator('.results-layout .global-panel-col');
  const resultBefore = await page.evaluate(() => {
    const panel = document.querySelector('.results-layout .global-panel-col');
    const map = document.querySelector('.results-layout .compact-map-frame');
    const main = document.querySelector('.results-layout');
    return {scrollHeight: panel?.scrollHeight, clientHeight: panel?.clientHeight,
      mapY: map?.getBoundingClientRect().y, mainOverflow: getComputedStyle(main).overflowY};
  });
  assert(resultBefore.scrollHeight > resultBefore.clientHeight && resultBefore.mainOverflow === 'hidden',
    'desktop results must scroll inside the left column only: ' + JSON.stringify(resultBefore));
  await resultsScroll.evaluate((panel) => { panel.scrollTop = 190; });
  await page.waitForTimeout(120);
  const resultAfter = await page.evaluate(() => ({
    scrollTop: document.querySelector('.results-layout .global-panel-col')?.scrollTop,
    mapY: document.querySelector('.results-layout .compact-map-frame')?.getBoundingClientRect().y,
  }));
  assert(resultAfter.scrollTop > 20 && Math.abs(resultAfter.mapY - resultBefore.mapY) <= 2,
    'moving the results must not move the map: ' + JSON.stringify({resultBefore,resultAfter}));
  await resultsScroll.evaluate((panel) => { panel.scrollTop = panel.scrollHeight; });
  await page.waitForTimeout(100);
  const lastCards = await page.locator('.results-layout .dashboard-bottom').boundingBox();
  const dockBounds = await page.locator('.bottom-nav').boundingBox();
  assert(lastCards && dockBounds && lastCards.y + lastCards.height < dockBounds.y - 4,
    'scrolled-to-bottom summary must clear the fixed navigation: ' + JSON.stringify({lastCards,dockBounds}));
  // Right-side map and impact must fit as one stationary composition, with
  // no sidebar scrollbar and neither card hidden behind the dock.
  const verifyRightFit = async (label) => {
    const fit = await page.evaluate(() => {
      const aside = document.querySelector('.results-layout .global-map-col');
      const map = document.querySelector('.results-layout .compact-map-frame');
      const card = document.querySelector('.results-layout .compact-map-card');
      const impact = document.querySelector('.results-layout .results-impact-panel');
      const nav = document.querySelector('.bottom-nav');
      const rect = (el) => el?.getBoundingClientRect();
      return {
        overflow: getComputedStyle(aside).overflowY,
        scrollHeight: aside.scrollHeight,
        clientHeight: aside.clientHeight,
        aside: rect(aside), map: rect(map), card: rect(card),
        impact: rect(impact), nav: rect(nav),
      };
    });
    assert(fit.overflow === 'hidden' && fit.scrollHeight <= fit.clientHeight + 2,
      label + ': right column must not scroll or clip content: ' + JSON.stringify(fit));
    assert(fit.map.height >= 135 && fit.card.bottom < fit.impact.top &&
      fit.impact.bottom <= fit.aside.bottom + 2 &&
      fit.impact.bottom <= fit.nav.top - 8,
      label + ': map + impact must both fit above floating nav: ' + JSON.stringify(fit));
  };
  await verifyRightFit('normal desktop');
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.waitForTimeout(150);
  await verifyRightFit('short laptop');
  await page.setViewportSize({ width: 1365, height: 768 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/pollution-demo-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await check('mobile layout', true);
  await page.screenshot({ path: '/tmp/pollution-home-mobile.png', fullPage: true });
  assert(errors.length === 0, 'Browser JS exceptions: ' + errors.join('; '));
  console.log('Browser smoke PASSED: non-scrolling 1280x640 landing, full-width steps, 3-tab selection, full-page map draft preservation, 6 hard reloads, environmental chips, 3-stop planner, demo route, mobile; environmental requests=' + envCalls);
} finally {
  await browser.close();
}
