import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '../api';
import { AMAZON_LOCATION_API_KEY, AMAZON_LOCATION_MAP_STYLE, AWS_REGION } from '../config';
import type { RuntimeConfig } from '../types';

type Station = {
  name: string;
  lat: number;
  lon: number;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  dataType?: 'model' | 'demo' | 'unavailable';
  validAt?: string | null;
  source: string;
  updated: string;
};

function color(aqi: number | null) {
  if (aqi === null || !Number.isFinite(aqi)) return '#94a3b8';
  if (aqi > 150) return '#b53a37';
  if (aqi > 100) return '#d47c24';
  if (aqi > 50) return '#d4b724';
  return '#157f55';
}

function styleUrl(config: RuntimeConfig) {
  const params = new URLSearchParams({
    key: config.mapApiKey || '',
    'color-scheme': 'Light',
    traffic: 'All',
    'poi-density': 'Sparse',
  });
  return `https://maps.geo.${config.region}.amazonaws.com/v2/styles/${config.mapStyle}/descriptor?${params.toString()}`;
}

async function mapConfig(): Promise<RuntimeConfig> {
  if (AMAZON_LOCATION_API_KEY) {
    return {
      region: AWS_REGION || 'ap-south-1',
      mapStyle: AMAZON_LOCATION_MAP_STYLE,
      mapApiKey: AMAZON_LOCATION_API_KEY,
      source: 'build-time Amazon Location configuration',
    };
  }
  return api.runtimeConfig();
}

export function IndiaScreen() {
  const [stations, setStations] = useState<Station[]>([]);
  const stationsRef = useRef<Station[]>([]);
  stationsRef.current = stations;
  const [status, setStatus] = useState<'loading'|'live'|'fallback'>('loading');
  const [coverageError, setCoverageError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    let active = true;
    void api.getIndia().then((response) => {
      if (active) { setStations(response.stations); setCoverageError(false); }
    }).catch(() => {
      if (active) { setStations([]); setCoverageError(true); }
    });
    const timer = window.setInterval(() => {
      void api.getIndia().then((response) => {
        if (active) setStations(response.stations);
      }).catch(() => {});
    }, 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!containerRef.current) {
      setStatus('fallback');
      return;
    }

    void mapConfig().then((config) => {
      if (!active || !containerRef.current || !config.mapApiKey) {
        if (active) setStatus('fallback');
        return;
      }

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl(config),
        center: [78.9629, 20.5937],
        zoom: 4.2,
        attributionControl: { compact: true },
        validateStyle: false,
        cooperativeGestures: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right'); const geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserLocation: true }); map.addControl(geolocate, 'top-right');

      let loaded = false;
      map.once('load', () => {
        if (!active) return;
        loaded = true; setTimeout(() => { geolocate.trigger(); }, 500);
        map.addSource('india-stations', {
          type: 'geojson',
          data: stationCollection(stationsRef.current) as any,
        });
        map.addLayer({
          id: 'india-stations-circles',
          type: 'circle',
          source: 'india-stations',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 8, 8, 18] as any,
            'circle-color': ['step', ['get', 'aqi'], '#157f55', 51, '#d4b724', 101, '#d47c24', 151, '#b53a37'] as any,
            'circle-opacity': .72,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        });

        map.on('click', 'india-stations-circles', (event) => {
          const feature = event.features?.[0];
          const coordinates = (feature?.geometry as any)?.coordinates;
          const properties = feature?.properties as any;
          if (!coordinates || !properties) return;
          new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
            .setLngLat(coordinates)
            .setHTML(
              `<div style="font:12px system-ui;color:#172019"><strong>${escapeHtml(properties.name)} · City model sample</strong><br>US AQI ${properties.aqi}<br>PM2.5 ${properties.pm25} µg/m³<br>PM10 ${properties.pm10} µg/m³<br><small>${escapeHtml(properties.source)} · not a monitoring station</small></div>`,
            )
            .addTo(map);
        });

        map.on('mouseenter', 'india-stations-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'india-stations-circles', () => { map.getCanvas().style.cursor = ''; });
        setStatus('live');
      });

      map.on('error', (e) => {
        console.error('MapLibre IndiaScreen Error:', e);
        if (!loaded && active) {
          try {
            map.remove();
          } catch (err) {}
          mapRef.current = null;
          setStatus('fallback');
        }
      });

    }).catch(() => {
      if (active) setStatus('fallback');
    });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    const source = map.getSource('india-stations') as maplibregl.GeoJSONSource | undefined;
    source?.setData(stationCollection(stations) as any);
  }, [stations]);

  return (
    <div className="screen wide india-screen">
      <div className="screen-title">
        <p className="eyebrow">NATIONAL OVERVIEW</p>
        <h1>India Environmental Intelligence</h1>
        <p>Six representative city-centre model samples, not CPCB monitoring stations. AQI uses the US EPA scale and may differ from India's official AQI. Forecast grids cannot resolve street-level exposure.</p>
      </div>

      {coverageError && <div role="status" className="error-banner">City environmental providers are unavailable. No readings have been fabricated.</div>}
      <div className="india-live-map">
        <div ref={containerRef} className={`india-map-canvas ${status === 'fallback' ? 'hidden' : ''}`}/>
        {status === 'fallback' && <div className="india-station-grid">
          {stations.map((station) => <article key={station.name}>
            <i style={{ background: color(station.aqi) }}/>
            <strong>{station.name}</strong>
            <span>{station.aqi === null ? 'Unavailable' : `US AQI ${Math.round(station.aqi)}`}</span>
            <small>{station.pm25 === null || station.pm10 === null ? 'No model data available' : `PM2.5 ${Math.round(station.pm25)} · PM10 ${Math.round(station.pm10)} µg/m³`}</small>
            <small>{station.source} · {station.validAt ? `model hour ${station.validAt}` : station.updated}</small>
          </article>)}
        </div>}
        {status === 'loading' && <div className="map-loading">Loading Amazon Location map…</div>}
        <span className={`map-live-badge ${status === 'fallback' ? 'fallback' : ''}`}>
          {status === 'live' ? 'AMAZON LOCATION MAP' : 'CITY SAMPLE VIEW · MODEL DATA'}
        </span>
      </div>
    </div>
  );
}

function stationCollection(stations: Station[]) {
  return {
    type: 'FeatureCollection',
    features: stations.filter((station) => station.aqi !== null && station.aqi > 0).map((station) => ({
      type: 'Feature',
      properties: {
        name: station.name,
        aqi: station.aqi,
        pm25: station.pm25,
        pm10: station.pm10,
        source: station.source,
      },
      geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
    })),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character] || character));
}
