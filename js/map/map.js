/* Leaflet, basemap layers, and controls shared by the map views. */
import { MAP_CENTER, MAP_ZOOM, PLACES, DEFAULT_START, DEFAULT_END } from '../config.js';
import { $ } from '../utils/dom.js';
import { initBasemaps } from './basemaps.js';
import { visitRoadSegments } from '../graph/road-spatial.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const map = L.map('map', {
  zoomControl: false, minZoom: 2, maxZoom: 19,
  trackResize: false, fadeAnimation: !reducedMotion(), zoomAnimation: !reducedMotion(),
  wheelDebounceTime: 60, wheelPxPerZoomLevel: 100
}).setView(MAP_CENTER, MAP_ZOOM);
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

map.createPane('localRoads').style.zIndex = '190';
map.createPane('previousRoute').style.zIndex = '395';
map.createPane('closures').style.zIndex = '420';
const markLocalRoadsReady = initBasemaps(map);
let localReady = false;

/* The local network sits beneath the tiles so it also covers failed or offline tile requests. */
export function showLocalRoads(g) {
  if (localReady) return;
  const options = { renderer: L.canvas({ pane: 'localRoads' }), interactive: false };
  const minor = L.polyline([], { ...options, color: '#a3b2b2', weight: 1, opacity: .75 }).addTo(map);
  const major = L.polyline([], { ...options, color: '#829899', weight: 2, opacity: .9 }).addTo(map);
  const fallbackNeeded = () => map.getContainer().classList.contains('needs-road-fallback');
  let frame = 0, renderedBounds, renderedZoom;
  function updateRoads() {
    frame = 0;
    if (!fallbackNeeded()) return;
    const visible = map.getBounds(), zoom = map.getZoom();
    if (zoom === renderedZoom && renderedBounds?.contains(visible)) return;
    const b = visible.pad(.12);
    const local = [], main = [];
    visitRoadSegments(g, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], (u, v, speed) => {
      if (zoom < 11 && speed < 40) return;
      (speed >= 35 ? main : local).push([[g.lat[u], g.lng[u]], [g.lat[v], g.lng[v]]]);
    });
    minor.setLatLngs(local);
    major.setLatLngs(main);
    renderedBounds = b; renderedZoom = zoom;
  }
  function scheduleRoads() {
    if (!frame && fallbackNeeded()) frame = requestAnimationFrame(updateRoads);
  }
  map.on('moveend', scheduleRoads);
  map.on('roadfallbackchange', ({ needed }) => {
    if (needed) scheduleRoads();
    else if (renderedBounds) {
      minor.setLatLngs([]); major.setLatLngs([]);
      renderedBounds = undefined;
    }
  });
  scheduleRoads();
  const labels = L.layerGroup(['Molo Church', 'Iloilo Esplanade', 'Jaro Cathedral'].map(name => L.marker(PLACES[name], {
    pane: 'localRoads', interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'local-place', html: tooltipText(name), iconSize: [0, 0] })
  })));
  const updateLabels = () => {
    if (map.getZoom() >= 13) labels.addTo(map);
    else labels.remove();
  };
  map.on('zoomend', updateLabels);
  updateLabels();
  localReady = true;
  markLocalRoadsReady();
}

export const fitPad = (maxZoom = 16) => {
  const size = map.getSize();
  const tools = map.getContainer().parentElement.querySelector('.map-tools');
  const top = tools.offsetHeight + tools.offsetTop + 12;
  return {
    paddingTopLeft: [23, Math.min(top, Math.round(size.y * .4))],
    paddingBottomRight: [26, Math.min(67, Math.round(size.y * .22))],
    maxZoom, animate: false
  };
};

let framing, fitting = false;
map.on('movestart zoomstart', () => { if (!fitting) framing = null; });
export function fitTrip(points, maxZoom) {
  if (!points.length || !map.getSize().y) return;
  framing = { points, maxZoom };
  fitting = true;
  try { map.fitBounds(points, fitPad(maxZoom)); }
  finally { fitting = false; }
}
export const showStudyArea = () => fitTrip([PLACES[DEFAULT_START], PLACES[DEFAULT_END]], 15);

export function tooltipText(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node;
}

export function setMapHint(text = '') {
  $('mapHint').textContent = text;
  $('mapHint').hidden = !text;
  if (text) { map.closePopup(); map.doubleClickZoom.disable(); }
  else map.doubleClickZoom.enable();
}

const legendEntries = {
  route: ['Current route', '#1e4ba8'],
  previous: ['Original route', '#626b75', 'dashed'],
  closures: ['Closed road', '#d7263d', 'dashed'],
  explored: ['Explored', '#a46a13'],
  frontier: ['Discovered', '#a46a13', 'dotted'],
  forward: ['Forward search', '#a46a13'],
  backward: ['Backward search', '#7a3fb5', 'dashed'],
  repair: ['LPA* repair updates', '#0e9f8e', 'dotted'],
  chokepoints: ['Ranked road link', '#694897', 'dashed']
};
const active = new Set();
export function setLegend(key, visible) {
  if (active.has(key) === visible) return;
  if (visible) active.add(key); else active.delete(key);
  $('legendItems').innerHTML = Object.entries(legendEntries).filter(([id]) => active.has(id))
    .map(([, [label, color, pattern]]) => `<li><i class="swatch ${pattern || ''}" style="--swatch:${color}" aria-hidden="true"></i>${label}</li>`).join('');
  $('mapLegend').hidden = !active.size;
}

$('studyArea').onclick = showStudyArea;

const container = map.getContainer();
new ResizeObserver(() => {
  const fit = framing;
  map.invalidateSize({ animate: false, debounceMoveend: true });
  if (fit) fitTrip(fit.points, fit.maxZoom);
}).observe(container);

/* The application assigns wheel behavior explicitly. It does not infer the input device. */
const wheelMode = $('wheelMode');
let wheelZoom = false, pendingPan = L.point(0, 0), panFrame = 0;
wheelMode.onclick = () => {
  wheelZoom = !wheelZoom;
  wheelMode.setAttribute('aria-pressed', wheelZoom);
  wheelMode.textContent = wheelZoom ? 'Scroll zooms' : 'Scroll pans';
  wheelMode.title = wheelZoom ? 'Scroll zooms the map. Switch to scroll to pan.' : 'Scroll pans the map. Hold Ctrl while scrolling to zoom.';
};
container.addEventListener('wheel', event => {
  if (event.target.closest('.leaflet-control, .leaflet-popup') || event.metaKey || event.altKey) {
    event.stopImmediatePropagation();
    return;
  }
  if (event.ctrlKey || wheelZoom) return; // Leaflet handles wheel zoom and pinch events exposed as Ctrl+wheel.
  event.preventDefault();
  event.stopImmediatePropagation();
  const mode = event.deltaMode;
  const size = map.getSize();
  const dx = event.deltaX * (mode === 1 ? 16 : mode === 2 ? size.x : 1);
  const dy = event.deltaY * (mode === 1 ? 16 : mode === 2 ? size.y : 1);
  pendingPan = pendingPan.add(event.shiftKey && !dx ? [dy, 0] : [dx, dy]);
  if (panFrame) return;
  panFrame = requestAnimationFrame(() => {
    const movement = pendingPan.round();
    pendingPan = pendingPan.subtract(movement);
    panFrame = 0;
    if (movement.x || movement.y) map.panBy(movement, { animate: false });
  });
}, { capture: true, passive: false });
