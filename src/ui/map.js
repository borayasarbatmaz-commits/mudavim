import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { App } from '../app.js';
import { S, offerInfo } from '../lib/state.js';
import { catInfo, CATEGORIES } from '../data/catalog.js';
import { $, esc, toast } from './dom.js';
import { fmtNum } from '../lib/text.js';

const OFM = 'https://tiles.openfreemap.org/styles/liberty';
const RASTER = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap katkıcıları' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

let resultMarkers = [];
let helpMarkers = [];
let extraMarkers = [];
let meMarker = null;
let styleOk = false;

export function initMap() {
  const map = new maplibregl.Map({
    container: 'map', style: OFM, center: [S.center[1], S.center[0]], zoom: 14, attributionControl: false, pitchWithRotate: false,
    dragRotate: true, maxZoom: 19,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Dükkan verisi: OpenStreetMap, Overture/Foursquare' }), 'bottom-left');
  App.map = map;
  const fallback = setTimeout(() => {
    if (!styleOk) {
      console.warn('Vektör harita yüklenemedi, OSM raster kullanılıyor');
      map.setStyle(RASTER);
    }
  }, 9000);
  map.on('style.load', () => {
    styleOk = true;
    clearTimeout(fallback);
    addLayers();
  });
  map.on('error', (e) => {
    if (!styleOk && /style|Failed to fetch|tiles\.openfreemap/i.test(String(e?.error?.message || ''))) {
      clearTimeout(fallback);
      map.setStyle(RASTER);
    }
  });
  map.on('click', 'places-dots', (e) => {
    const f = e.features?.[0];
    if (f) App.openPlace(f.properties.id);
  });
  map.on('mouseenter', 'places-dots', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'places-dots', () => (map.getCanvas().style.cursor = ''));
  return map;
}

function placesGeo() {
  return {
    type: 'FeatureCollection',
    features: S.places.filter((p) => !S.closedPlaces.has(p.id)).map((p) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id, f: CATEGORIES[p.cat]?.food ? 1 : 0 },
    })),
  };
}

function addLayers() {
  const map = App.map;
  if (!map.getSource('places')) map.addSource('places', { type: 'geojson', data: placesGeo() });
  if (!map.getLayer('places-dots')) {
    map.addLayer({
      id: 'places-dots', type: 'circle', source: 'places', minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 7],
        'circle-color': ['case', ['==', ['get', 'f'], 1], '#ea580c', '#57534e'],
        'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-opacity': 0.85,
      },
    });
  }
  if (!map.getSource('route')) map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer('route-casing')) {
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0f5d56', 'line-width': 10 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#14b8a6', 'line-width': 6 } });
  }
}

export function refreshPlaces() {
  App.map?.getSource('places')?.setData(placesGeo());
}

export function setRoute(coords) {
  const src = App.map?.getSource('route');
  if (!src) return;
  src.setData(coords ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } : { type: 'FeatureCollection', features: [] });
}

function pinEl({ emoji, cls = '', label = '' }) {
  const el = document.createElement('div');
  el.className = `mpin ${cls}`;
  el.innerHTML = `<div class="b"></div><div class="e">${emoji}</div>${label ? `<div class="s">${esc(label)}</div>` : ''}`;
  return el;
}

export function setResultMarkers(results, onClick) {
  clearResultMarkers();
  const seen = new Set();
  let inferN = 0;
  for (const r of results) {
    if (seen.has(r.place.id) || resultMarkers.length >= 60) continue;
    if (r.kind === 'infer' && inferN++ >= 15) continue;
    seen.add(r.place.id);
    const c = catInfo(r.place.cat);
    let cls = 'lv0';
    let label = '';
    if (r.kind === 'offer') {
      cls = `${r.inf.level.cls} ${r.inf.fresh.cls === 'stale' ? 'stale' : ''}`;
      if (r.score) label = `${fmtNum(r.score)}★`;
    } else if (r.kind === 'place') {
      cls = 'lv2';
      if (r.score) label = `${fmtNum(r.score)}★`;
    }
    const el = pinEl({ emoji: c.icon, cls, label });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(r);
    });
    const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.place.lon, r.place.lat]).addTo(App.map);
    m._pid = r.place.id;
    resultMarkers.push(m);
  }
}
export function clearResultMarkers() {
  resultMarkers.forEach((m) => m.remove());
  resultMarkers = [];
}
export function highlightPlace(pid) {
  for (const m of resultMarkers) m.getElement().classList.toggle('sel', m._pid === pid);
}

export function setHelpMarkers(list, onClick) {
  helpMarkers.forEach((m) => m.remove());
  helpMarkers = [];
  for (const h of list) {
    const el = document.createElement('div');
    el.className = `hpin ${h.u === 'me' ? 'mine' : ''} ${h.status === 'solved' ? 'solved' : ''}`;
    el.textContent = h.status === 'solved' ? '✓' : '?';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(h);
    });
    helpMarkers.push(new maplibregl.Marker({ element: el }).setLngLat([h.lon, h.lat]).addTo(App.map));
  }
}

export function setExtraMarkers(items) {
  extraMarkers.forEach((m) => m.remove());
  extraMarkers = items.map(({ lat, lon, html: h, cls = 'spin', onClick }) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = h;
    if (onClick) el.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(App.map);
  });
}

export function updateMe() {
  if (!S.pos || !App.map) return;
  if (!meMarker) {
    const el = document.createElement('div');
    el.className = 'me-dot';
    el.innerHTML = '<div class="cone" hidden></div>';
    meMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([S.pos.lon, S.pos.lat]).addTo(App.map);
  }
  meMarker.setLngLat([S.pos.lon, S.pos.lat]);
  const cone = meMarker.getElement().querySelector('.cone');
  if (App.heading != null) {
    cone.hidden = false;
    meMarker.setRotation(App.heading);
  }
}

export function flyTo(lat, lon, zoom = 16) {
  App.map?.flyTo({ center: [lon, lat], zoom, duration: 700, padding: mapPadding() });
}

export function mapPadding() {
  const sheet = $('#sheet');
  const st = sheet?.dataset.state;
  const h = window.innerHeight;
  const bottom = st === 'half' ? h * 0.46 - 62 : st === 'peek' ? 150 : 40;
  return { top: 120, bottom: Math.max(40, bottom), left: 30, right: 30 };
}

export function fitTo(points) {
  if (!points.length || !App.map) return;
  if (points.length === 1) return flyTo(points[0][0], points[0][1], 16);
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  App.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: mapPadding(), maxZoom: 16.5, duration: 700 });
}

// Haritadan nokta seçtirme (artı işaretiyle)
export function pickLocation(prompt, okText = 'Burayı seç') {
  return new Promise((resolve) => {
    const cross = document.createElement('div');
    cross.className = 'crosshair';
    cross.textContent = '📍';
    const bar = document.createElement('div');
    bar.className = 'pickbar';
    bar.innerHTML = `<p>${esc(prompt)}</p><div class="btns"><button class="btn" data-x>Vazgeç</button><button class="btn primary" data-ok>${esc(okText)}</button></div>`;
    $('#app').append(cross, bar);
    $('#sheet').dataset.state = 'hidden';
    const done = (v) => {
      cross.remove();
      bar.remove();
      resolve(v);
    };
    bar.querySelector('[data-x]').onclick = () => done(null);
    bar.querySelector('[data-ok]').onclick = () => {
      const r = $('#map').getBoundingClientRect();
      const c = cross.getBoundingClientRect();
      const pt = App.map.unproject([c.left + c.width / 2 - r.left, c.bottom - r.top - 2]);
      done({ lat: pt.lat, lon: pt.lng });
    };
  });
}

export function noteNoStyle() {
  if (!styleOk) toast('Harita altlığı yüklenemedi, internet bağlantını kontrol et');
}

export { offerInfo };
