/* Leaflet, basemap layers, and controls shared by the map views. */
import { MAP_CENTER, MAP_ZOOM, PLACES, DEFAULT_START, DEFAULT_END } from '../config.js';
import { $ } from '../utils/dom.js';
import { on } from '../events.js';
import { initBasemaps } from './basemaps.js';
import { initNetworkView } from './network-view.js';
import { roadSpatialIndex, visitRoadSegments } from '../graph/road-spatial.js';
import { ALGORITHMS, REPAIR_SEARCH_STYLE, RETAINED_SEARCH_COLOR } from '../algorithms/index.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const map = L.map('map', {
  zoomControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true,
  trackResize: false, fadeAnimation: !reducedMotion(), zoomAnimation: !reducedMotion(),
  wheelDebounceTime: 60, wheelPxPerZoomLevel: 100
}).setView(MAP_CENTER, MAP_ZOOM);
map.on('moveend', () => {
  const center = map.getCenter();
  // Dragging wraps in Leaflet. Keep wheel and keyboard pans in the same world copy.
  if (center.lng < -180 || center.lng > 180) map.panTo(map.wrapLatLng(center), { animate: false });
});
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

map.createPane('localRoads').style.zIndex = '190';
map.createPane('previousRoute').style.zIndex = '395';
map.createPane('closures').style.zIndex = '420';
map.createPane('criticalRoads').style.zIndex = '425';
map.createPane('closurePreview').style.zIndex = '430';
const { setLocalBounds: markLocalRoadsReady } = initBasemaps(map);
const updateNetworkGraph = initNetworkView(map);
let removeLocalRoads;

/* The local network sits beneath the tiles so it also covers failed or offline tile requests. */
export function showLocalRoads(g, iloiloLabels) {
  updateNetworkGraph(g);
  removeLocalRoads?.();
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
  function fallbackChanged({ needed }) {
    if (needed) scheduleRoads();
    else if (renderedBounds) {
      minor.setLatLngs([]); major.setLatLngs([]);
      renderedBounds = undefined;
    }
  }
  map.on('roadfallbackchange', fallbackChanged);
  scheduleRoads();
  const labels = L.layerGroup(['Molo Church', 'Iloilo Esplanade', 'Jaro Cathedral'].map(name => L.marker(PLACES[name], {
    pane: 'localRoads', interactive: false, keyboard: false,
    icon: L.divIcon({ className: 'local-place', html: tooltipText(name), iconSize: [0, 0] })
  })));
  const updateLabels = () => {
    if (iloiloLabels && map.getZoom() >= 13) labels.addTo(map);
    else labels.remove();
  };
  map.on('zoomend', updateLabels);
  updateLabels();
  removeLocalRoads = () => {
    cancelAnimationFrame(frame);
    map.off('moveend', scheduleRoads);
    map.off('roadfallbackchange', fallbackChanged);
    map.off('zoomend', updateLabels);
    labels.remove(); minor.remove(); major.remove(); options.renderer.remove();
  };
  const [w, s, e, n] = roadSpatialIndex(g).bounds;
  markLocalRoadsReady(L.latLngBounds([s, w], [n, e]));
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

export function fitTrip(points, maxZoom) {
  if (!points.length || !map.getSize().y) return;
  map.fitBounds(points, fitPad(maxZoom));
}

const coveragePane = map.createPane('roadCoverage');
coveragePane.style.zIndex = '325';
const coverageStyle = { pane: 'roadCoverage', interactive: false, color: '#354d65', weight: 1.75,
  opacity: .67, dashArray: '6 6', fill: false, className: 'analysis-outline' };
let roadRegion, regionBounds, coverageLayer, coverageRequest;
export function showStudyArea() {
  if (regionBounds) fitTrip([regionBounds.getSouthWest(), regionBounds.getNorthEast()], 15);
  else fitTrip([PLACES[DEFAULT_START], PLACES[DEFAULT_END]], 15);
}

export function setMapRegion(region, frame = true) {
  roadRegion = region;
  coverageRequest?.abort();
  coverageLayer?.remove();
  const [west, south, east, north] = region.bounds;
  regionBounds = L.latLngBounds([south, west], [north, east]);
  coverageLayer = L.rectangle(regionBounds, coverageStyle).addTo(map);
  setLegend('coverage', true);
  const label = `Return to ${region.name}`;
  $('studyArea').title = label;
  $('studyArea').setAttribute('aria-label', label);
  if (frame) showStudyArea();
  if (region.coverageUrl) loadCoverage(region);
}

async function loadCoverage(region) {
  const { signal } = coverageRequest = new AbortController();
  try {
    const response = await fetch(region.coverageUrl, { signal });
    if (!response.ok) throw Error('Boundary file unavailable');
    const boundary = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    if (signal.aborted || roadRegion !== region) return;
    const layer = L.geoJSON(boundary, { pane: 'roadCoverage', style: coverageStyle }).addTo(map);
    coverageLayer?.remove();
    coverageLayer = layer;
  } catch (error) {
    if (!signal.aborted) console.warn('Showing road graph bounds instead of the boundary.', error);
  }
}

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
  coverage: ['Road network extent', '#354d65', 'dashed'],
  start: ['Start A', 'point-a'],
  destination: ['Destination B', 'point-b'],
  route: ['Current route', '#1e4ba8'],
  previous: ['Previous route (reference)', '#626b75', 'dashed'],
  closures: ['Closed road', '#d7263d', 'dashed'],
  ...Object.fromEntries(Object.entries(ALGORITHMS).filter(([key]) => key !== 'bidir').map(([key, algo]) =>
    [key, [`${algo.name} · processed`, algo.color]])),
  frontier: ['Frontier discoveries', '#64748b', 'dotted'],
  forward: ['Bidirectional Dijkstra · forward', ALGORITHMS.bidir.color],
  backward: ['Bidirectional Dijkstra · backward', ALGORITHMS.bidir.backward, 'dashed'],
  repair: ['LPA* · repair events', REPAIR_SEARCH_STYLE.color, 'dotted'],
  retained: ['LPA* · retained settled labels', RETAINED_SEARCH_COLOR, 'dotted'],
  chokepoints: ['Ranked road link', '#694897', 'dashed']
};
const active = new Set();
const traces = new Set(['astar', 'lpa', 'dijkstra', 'frontier', 'forward', 'backward', 'repair', 'retained']);
export function setLegend(key, visible) {
  if (active.has(key) === visible) return;
  if (visible) active.add(key); else active.delete(key);
  $('legendItems').innerHTML = Object.entries(legendEntries).filter(([id]) => active.has(id))
    .map(([id, [label, color, pattern]]) => {
      const symbol = color.startsWith('point-')
        ? `<img class="legend-pin" src="assets/icons/display/${color}.png" alt="">`
        : `<i class="swatch ${pattern || ''}" style="--swatch:${color}" aria-hidden="true"></i>`;
      return `<li class="legend-${id} ${traces.has(id) ? 'trace-legend' : ''}">${symbol}${label}</li>`;
    }).join('');
  $('mapLegend').hidden = !active.size;
}

$('studyArea').onclick = showStudyArea;

const container = map.getContainer();
function resizeMap() {
  const { x, y } = map.getSize();
  if (x === container.clientWidth && y === container.clientHeight) return;
  map.invalidateSize({ animate: false, debounceMoveend: true });
}
on('workspace:changed', resizeMap);
new ResizeObserver(resizeMap).observe(container);

/* The application assigns wheel behavior explicitly. It does not infer the input device. */
const wheelMode = $('wheelMode');
let wheelZoom = false, pendingPan = L.point(0, 0), panFrame = 0;
wheelMode.onclick = () => {
  wheelZoom = !wheelZoom;
  wheelMode.setAttribute('aria-pressed', wheelZoom);
  wheelMode.title = wheelZoom ? 'Scroll zooms the map. Switch to scroll to pan.' : 'Scroll pans the map. Hold Ctrl while scrolling to zoom.';
};
container.addEventListener('wheel', event => {
  if (event.target.closest('.leaflet-control, .leaflet-popup') || event.metaKey || event.altKey) {
    event.stopImmediatePropagation();
    return;
  }
  if (container.classList.contains('drawing-stroke')) {
    event.preventDefault();
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
