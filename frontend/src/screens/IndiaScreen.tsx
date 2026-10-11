import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '../api';
import { AMAZON_LOCATION_API_KEY, AMAZON_LOCATION_MAP_STYLE, AWS_REGION } from '../config';
import type { RuntimeConfig } from '../types';
import { MapPin, Globe, Activity, ShieldCheck } from 'lucide-react';

type Station = {
  name: string;
  lat: number;
  lon: number;
  aqi: number;
  pm25: number;
  pm10: number;
  source: string;
  updated: string;
};

function color(aqi: number) {
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    let active = true;
    void api.getIndia().then((response) => {
      if (active) setStations(response.stations);
    }).catch(() => {
      if (active) setStations([]);
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
        zoom: 4.4,
        attributionControl: { compact: true },
        validateStyle: false,
        cooperativeGestures: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      let loaded = false;
      map.once('load', () => {
        if (!active) return;
        loaded = true;
        map.addSource('india-stations', {
          type: 'geojson',
          data: stationCollection(stationsRef.current) as any,
        });
        map.addLayer({
          id: 'india-stations-circles',
          type: 'circle',
          source: 'india-stations',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 22] as any,
            'circle-color': ['step', ['get', 'aqi'], '#157f55', 51, '#d4b724', 101, '#d47c24', 151, '#b53a37'] as any,
            'circle-opacity': 0.78,
            'circle-stroke-color': '#cba157',
            'circle-stroke-width': 2,
          },
        });

        map.on('click', 'india-stations-circles', (event) => {
          const feature = event.features?.[0];
          const coordinates = (feature?.geometry as any)?.coordinates;
          const properties = feature?.properties as any;
          if (!coordinates || !properties) return;
          new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
            .setLngLat(coordinates)
            .setHTML(
              `<div style="font:13px 'Plus Jakarta Sans', system-ui;color:#07120c;padding:4px">
                <strong style="font-size:14px;color:#0e3621">${escapeHtml(properties.name)}</strong><br>
                <div style="margin:4px 0;font-weight:600">US AQI: ${properties.aqi}</div>
                <div style="font-size:11px;color:#4a5951">PM2.5: ${properties.pm25} µg/m³ · PM10: ${properties.pm10} µg/m³</div>
                <small style="font-size:10px;color:#7a8a81;margin-top:4px;display:block">${escapeHtml(properties.source)}</small>
              </div>`,
            )
            .addTo(map);
        });

        map.on('mouseenter', 'india-stations-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'india-stations-circles', () => { map.getCanvas().style.cursor = ''; });
        setStatus('live');
      });

      map.on('error', () => {
        if (!loaded && active) setStatus('fallback');
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
        <p className="eyebrow">ACT V · NATIONAL ENVIRONMENTAL INTELLIGENCE</p>
        <h1>Subcontinental Air Observation</h1>
        <p>
          Modeled US AQI and particulate forecasts across primary Indian metropolitan hubs.
          Powered by Amazon Location Maps V2 with real-time traffic overlays.
        </p>
      </div>

      <div className="india-live-map">
        <div ref={containerRef} className={`india-map-canvas ${status === 'fallback' ? 'hidden' : ''}`}/>
        {status === 'fallback' && (
          <div className="india-station-grid">
            {stations.map((station) => (
              <article key={station.name}>
                <i style={{ background: color(station.aqi) }}/>
                <strong>{station.name}</strong>
                <span>AQI {Math.round(station.aqi)}</span>
                <small>PM2.5 {Math.round(station.pm25)} · PM10 {Math.round(station.pm10)}</small>
              </article>
            ))}
          </div>
        )}
        {status === 'loading' && <div className="map-loading">Loading Amazon Location map…</div>}
        <span className={`map-live-badge ${status === 'fallback' ? 'fallback' : ''}`}>
          {status === 'live' ? 'AWS LIVE MAP · AMAZON LOCATION' : 'LIVE DATA · MAP FALLBACK'}
        </span>
      </div>

      {/* METROPOLITAN STATIONS BREAKDOWN GRID */}
      <div style={{ marginTop: '28px' }}>
        <div className="card-kicker" style={{ marginBottom: '12px' }}>METROPOLITAN OBSERVATORIES</div>
        <div className="india-preview-grid">
          {stations.map((station) => (
            <div key={station.name} className="city-telemetry-card renaissance-card">
              <div className="city-card-header">
                <MapPin size={15} className="gold-accent" />
                <strong>{station.name}</strong>
                <span 
                  style={{ 
                    marginLeft: 'auto', 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    color: color(station.aqi),
                    padding: '2px 8px',
                    borderRadius: '99px',
                    background: 'rgba(255,255,255,0.06)'
                  }}
                >
                  AQI {Math.round(station.aqi)}
                </span>
              </div>
              <p className="city-desc" style={{ marginBottom: '6px' }}>
                PM2.5: <strong>{Math.round(station.pm25)} µg/m³</strong> · PM10: <strong>{Math.round(station.pm10)} µg/m³</strong>
              </p>
              <div className="city-coords">
                <span>{station.source}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function stationCollection(stations: Station[]) {
  return {
    type: 'FeatureCollection',
    features: stations.filter((station) => station.aqi > 0).map((station) => ({
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
