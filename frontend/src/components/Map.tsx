import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus, ExternalLink } from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { Coordinates, TripAnalysis } from '../types';
import './Map.css';

/**
 * A real raster map that uses standard DOM images instead of WebGL.
 * No async map constructor, API key, map style fetch, GPU dependency or
 * imperative React-external lifecycle can take down the home screen.
 */
const TILE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 17;
const INDIA: Coordinates = { lat: 20.5937, lon: 78.9629 };
type View = { center: Coordinates; zoom: number };
type Extent = { width: number; height: number };
type Stop = { id: string; index: number; label: string; point: Coordinates; details: string };
type RasterTile = { id: string; x: number; y: number; sourceX: number; sourceY: number; zoom: number };

function valid(point: Coordinates | undefined | null): point is Coordinates {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && point.lat >= -85.05 && point.lat <= 85.05 && point.lon >= -180 && point.lon <= 180;
}
function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}
function mercator(point: Coordinates, zoom: number) {
  const size = TILE * 2 ** zoom;
  const latitude = clamp(point.lat, -85.05, 85.05) * Math.PI / 180;
  return {
    x: (point.lon + 180) / 360 * size,
    y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * size,
  };
}
function fromPixels(x: number, y: number, zoom: number): Coordinates {
  const size = TILE * 2 ** zoom;
  const normalized = ((x / size) % 1 + 1) % 1;
  const latitude = (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * clamp(y / size, .0001, .9999)))) - Math.PI / 2) * 180 / Math.PI;
  return { lat: latitude, lon: normalized * 360 - 180 };
}
function allPoints(trips: TripAnalysis[]): Coordinates[] {
  const points: Coordinates[] = [];
  for (const trip of trips) {
    for (const geometry of [trip.original?.geometry, trip.recommended?.geometry]) {
      if (Array.isArray(geometry)) points.push(...geometry.filter(valid));
    }
  }
  return points;
}
function bestView(points: Coordinates[], extent: Extent): View {
  if (points.length === 0) return { center: INDIA, zoom: 4 };
  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const minLon = Math.min(...points.map((p) => p.lon));
  const maxLon = Math.max(...points.map((p) => p.lon));
  const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const a = mercator({ lat: minLat, lon: minLon }, zoom);
    const b = mercator({ lat: maxLat, lon: maxLon }, zoom);
    if (Math.abs(a.x - b.x) < Math.max(110, extent.width - 84) &&
        Math.abs(a.y - b.y) < Math.max(90, extent.height - 84)) return { center, zoom };
  }
  return { center, zoom: MIN_ZOOM };
}
function project(point: Coordinates, view: View, extent: Extent) {
  const world = TILE * 2 ** view.zoom;
  const center = mercator(view.center, view.zoom);
  const p = mercator(point, view.zoom);
  let dx = p.x - center.x;
  if (dx > world / 2) dx -= world;
  if (dx < -world / 2) dx += world;
  return { x: extent.width / 2 + dx, y: extent.height / 2 + p.y - center.y };
}
function routePath(points: Coordinates[] | undefined, view: View, extent: Extent) {
  if (!Array.isArray(points) || points.length < 2) return '';
  return points.filter(valid).map((point, i) => {
    const pos = project(point, view, extent);
    return (i ? ' L ' : 'M ') + pos.x.toFixed(1) + ' ' + pos.y.toFixed(1);
  }).join('');
}
function tilesInView(view: View, extent: Extent): RasterTile[] {
  const n = 2 ** view.zoom;
  const p = mercator(view.center, view.zoom);
  const left = Math.floor((p.x - extent.width / 2) / TILE);
  const right = Math.floor((p.x + extent.width / 2) / TILE);
  const top = Math.floor((p.y - extent.height / 2) / TILE);
  const bottom = Math.floor((p.y + extent.height / 2) / TILE);
  const tiles: RasterTile[] = [];
  for (let y = Math.max(0, top); y <= Math.min(n - 1, bottom); y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (tiles.length >= 35) return tiles;
      const sourceX = ((x % n) + n) % n;
      tiles.push({
        id: view.zoom + '-' + x + '-' + y,
        zoom: view.zoom, sourceX, sourceY: y,
        x: x * TILE - p.x + extent.width / 2,
        y: y * TILE - p.y + extent.height / 2,
      });
    }
  }
  return tiles;
}
function arrivalTime(departure: string, travelMinutes: number): string {
  if (!/^\d{2}:\d{2}$/.test(departure)) return 'Scheduled destination';
  const [hours, minutes] = departure.split(':').map(Number);
  if (!Number.isFinite(travelMinutes)) return 'Scheduled destination';
  const total = (hours * 60 + minutes + Math.max(0, travelMinutes)) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(Math.floor(total % 60)).padStart(2, '0');
}
function routeStops(trips: TripAnalysis[]): Stop[] {
  const stops: Stop[] = [];
  for (const [i, trip] of trips.entries()) {
    const points = (Array.isArray(trip.recommended?.geometry) && trip.recommended.geometry.length
      ? trip.recommended.geometry : trip.original?.geometry || []).filter(valid);
    if (i === 0 && points[0]) {
      stops.push({ id: trip.tripId + '-origin', index: 0, point: points[0],
        label: trip.origin, details: 'Start · ' + trip.original.departureTime });
    }
    if (points.length) {
      const candidate = trip.recommended;
      stops.push({ id: trip.tripId + '-destination', index: i + 1,
        point: points[points.length - 1], label: trip.destination,
        details: 'Arrive around ' + arrivalTime(candidate.departureTime, candidate.travelMinutes) +
          ' · ' + candidate.mode + ' · ' + candidate.travelMinutes + ' min' });
    }
  }
  return stops;
}
function fallbackUrl(view: View, extent: Extent, liveLocation?: Coordinates | null) {
  const center = mercator(view.center, view.zoom);
  const southwest = fromPixels(center.x - extent.width / 2, center.y + extent.height / 2, view.zoom);
  const northeast = fromPixels(center.x + extent.width / 2, center.y - extent.height / 2, view.zoom);
  const bbox = [southwest.lon, southwest.lat, northeast.lon, northeast.lat].map((x) => x.toFixed(5)).join(',');
  const marker = valid(liveLocation) ? '&marker=' + encodeURIComponent(liveLocation.lat + ',' + liveLocation.lon) : '';
  return 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik' + marker;
}

function TileImage({ tile, onLoaded }: { tile: RasterTile; onLoaded: () => void }) {
  const [provider, setProvider] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const uri = provider === 0
    ? 'https://tile.openstreetmap.org/' + tile.zoom + '/' + tile.sourceX + '/' + tile.sourceY + '.png'
    : 'https://a.tile.openstreetmap.fr/hot/' + tile.zoom + '/' + tile.sourceX + '/' + tile.sourceY + '.png';
  const style: CSSProperties = { position: 'absolute', left: tile.x, top: tile.y,
    width: TILE, height: TILE, display: loaded ? 'block' : 'none', pointerEvents: 'none' };
  return <img draggable={false} className="raster-tile" src={uri} alt="" decoding="async" style={style}
    onLoad={() => { setLoaded(true); onLoaded(); }}
    onError={() => { if (provider === 0) { setProvider(1); setLoaded(false); } else setFailed(true); }}/>;
}

export function Map({ trips, liveLocation, isDemo = false, previewPoints = [] }: {
  trips: TripAnalysis[]; liveLocation?: Coordinates | null; isDemo?: boolean;
  previewPoints?: { id: string; label: string; point: Coordinates }[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; original: View } | null>(null);
  const hasCenteredGps = useRef(false);
  const [extent, setExtent] = useState<Extent>({ width: 350, height: 275 });
  const [view, setView] = useState<View>(() => ({ center: valid(liveLocation) ? liveLocation : INDIA, zoom: valid(liveLocation) ? 12 : 4 }));
  const [fallbackView, setFallbackView] = useState<View>(() => ({ center: valid(liveLocation) ? liveLocation : INDIA, zoom: valid(liveLocation) ? 12 : 4 }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasTile, setHasTile] = useState(false);
  const [mapNote, setMapNote] = useState('');
  const analyzedPoints = useMemo(() => allPoints(trips), [trips]);
  const previewCoords = useMemo(() => previewPoints.map((stop) => stop.point).filter(valid), [previewPoints]);
  const points = analyzedPoints.length ? analyzedPoints : previewCoords;
  const stops = useMemo(() => routeStops(trips), [trips]);
  const mapTiles = useMemo(() => tilesInView(view, extent), [view, extent]);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const refresh = () => {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        setExtent((previous) => previous.width === Math.round(box.width) && previous.height === Math.round(box.height)
          ? previous : { width: Math.round(box.width), height: Math.round(box.height) });
      }
    };
    refresh();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', refresh);
      return () => window.removeEventListener('resize', refresh);
    }
    const observer = new ResizeObserver(refresh);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (points.length) setView(bestView(points, extent));
  }, [points, extent.width, extent.height]);

  useEffect(() => {
    if (!hasCenteredGps.current && points.length === 0 && valid(liveLocation)) {
      hasCenteredGps.current = true;
      setView((old) => ({ center: liveLocation, zoom: old.zoom < 8 ? 12 : old.zoom }));
    }
  }, [liveLocation?.lat, liveLocation?.lon, points.length]);

  // An iframe fallback should not navigate dozens of times per second during a drag.
  useEffect(() => {
    const timer = window.setTimeout(() => setFallbackView(view), 500);
    return () => window.clearTimeout(timer);
  }, [view]);

  const tileLoaded = useCallback(() => setHasTile(true), []);
  const zoomTo = (nextZoom: number) => {
    setView((previous) => ({ ...previous, zoom: clamp(nextZoom, MIN_ZOOM, MAX_ZOOM) }));
    setHasTile(false);
  };
  const locate = () => {
    if (valid(liveLocation)) {
      setView({ center: liveLocation, zoom: 13 });
      setMapNote('');
      return;
    }
    if (!navigator.geolocation) { setMapNote('Location is not supported by this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        if (valid(coords)) { setView({ center: coords, zoom: 13 }); setMapNote(''); }
      },
      () => setMapNote('Allow location access in your browser or enter a starting address.'),
      { timeout: 7000, maximumAge: 5 * 60_000 },
    );
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    pointer.current = { x: event.clientX, y: event.clientY, original: view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointer.current) return;
    const drag = pointer.current;
    const p = mercator(drag.original.center, drag.original.zoom);
    setView({ center: fromPixels(p.x - (event.clientX - drag.x), p.y - (event.clientY - drag.y), drag.original.zoom), zoom: drag.original.zoom });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomTo(view.zoom + (event.deltaY < 0 ? 1 : -1));
  };
  const selected = stops.find((stop) => stop.id === selectedId);
  const previewSelected = !trips.length ? previewPoints.find((stop) => stop.id === selectedId) : undefined;
  return <div className="raster-map" ref={container} aria-label="Route map: OpenStreetMap tiles, Amazon Location routing" data-map-engine="dom-raster" data-map-ready={hasTile ? 'true' : 'fallback'}>
    <div className="raster-map-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      <iframe title="OpenStreetMap basemap fallback" className="raster-basemap-frame" src={fallbackUrl(fallbackView, extent, liveLocation)}
        loading="eager" referrerPolicy="strict-origin-when-cross-origin" tabIndex={-1} aria-hidden="true"/>
      {mapTiles.map((tile) => <TileImage key={tile.id} tile={tile} onLoaded={tileLoaded}/>)}
      <svg className="raster-route-overlay" width={extent.width} height={extent.height} viewBox={'0 0 ' + extent.width + ' ' + extent.height} aria-hidden="true">
        {trips.length === 0 && previewCoords.length > 1 && <path d={routePath(previewCoords, view, extent)} className="raster-route-preview"/>}
        {trips.map((trip) => <g key={trip.tripId}>
          <path d={routePath(trip.original?.geometry, view, extent)} className="raster-route-original"/>
          <path d={routePath(trip.recommended?.geometry, view, extent)} className="raster-route-optimized"/>
        </g>)}
      </svg>
      {valid(liveLocation) && (() => {
        const pos = project(liveLocation, view, extent);
        return <span className="raster-you" style={{ left: pos.x, top: pos.y }} title="Your live location" aria-label="Your live location"/>;
      })()}
      {trips.length === 0 && previewPoints.map((stop, index) => {
        const pos = project(stop.point, view, extent);
        if (pos.x < -20 || pos.x > extent.width + 20 || pos.y < -20 || pos.y > extent.height + 20) return null;
        return <button type="button" key={stop.id} className="raster-stop-marker preview" style={{ left: pos.x, top: pos.y }}
          title={stop.label} aria-label={`Preview stop ${index}: ${stop.label}`} onClick={() => setSelectedId(stop.id)}>{index || 'S'}</button>;
      })}
      {stops.map((stop) => {
        const pos = project(stop.point, view, extent);
        if (pos.x < -20 || pos.x > extent.width + 20 || pos.y < -20 || pos.y > extent.height + 20) return null;
        return <button type="button" key={stop.id} className="raster-stop-marker"
          aria-label={'Stop ' + stop.index + ': ' + stop.label} title={stop.label}
          style={{ left: pos.x, top: pos.y }} onClick={() => setSelectedId(stop.id)}>{stop.index || 'S'}</button>;
      })}
    </div>
    <div className="raster-map-controls">
      <button type="button" aria-label="Zoom in" onClick={() => zoomTo(view.zoom + 1)}><Plus size={16}/></button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomTo(view.zoom - 1)}><Minus size={16}/></button>
      <button type="button" aria-label="Find my location" onClick={locate}><LocateFixed size={16}/></button>
    </div>
    <div className="raster-map-badge">{isDemo ? 'Demo · OSM' : trips.length ? 'AWS routes' : previewPoints.length ? 'AWS places' : 'OSM map'}</div>
    {previewSelected && <div className="raster-stop-detail" role="status"><button type="button" aria-label="Close stop details" onClick={() => setSelectedId(null)}>×</button><strong>{previewSelected.label}</strong><span>Amazon Location found this place. Straight-line preview only; AWS routes appear after Analyze.</span></div>}
    {selected && <div className="raster-stop-detail" role="status">
      <button type="button" aria-label="Close stop details" onClick={() => setSelectedId(null)}>×</button>
      <strong>{selected.index === 0 ? 'Start' : 'Stop ' + selected.index} · {selected.label}</strong>
      <span>{selected.details}</span>
    </div>}
    {mapNote && <p className="raster-map-note" role="status">{mapNote}</p>}
    {!trips.length && previewCoords.length > 1 && <div className="raster-preview-label">Stop preview · Road route after Analyze</div>}
    {trips.length > 0 && <div className="map-route-legend">
      <span><i className="map-line current"/>Original</span>
      <span><i className="map-line recommended"/>Optimized</span>
    </div>}
    <a className="raster-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap <ExternalLink size={10}/></a>
  </div>;
}
