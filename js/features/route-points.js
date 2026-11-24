/* Route endpoints, including explicit map picking, swap, GPS, and defaults. */
import { state } from '../state.js';
import { map, setMapHint } from '../map/map.js';
import { setMarkerDragging, setPointMarker } from '../map/markers.js';
import { $, setMessage } from '../utils/dom.js';
import { PLACES, DEFAULT_START, DEFAULT_END } from '../config.js';
import { snapRoutePoint } from '../graph/road-graph.js';
import { connectionMessage } from './route-status.js';
import { fmtD } from '../utils/format.js';
import { emit, on } from '../events.js';
import { isDrawing, handleMapClick } from './closures.js';

let picking = null, routeMode = true, locationRequest = 0, graph;

function showRoadAccess(which) {
  const point = which === 's' ? state.start : state.end;
  if (!graph || !point) return;
  const field = $(which === 's' ? 'from' : 'to');
  const hint = $(field.id + 'Access');
  const { i, d, reason } = snapRoutePoint(graph, point);
  field.setAttribute('aria-invalid', String(i < 0));
  hint.textContent = i < 0
    ? connectionMessage(reason)
    : d >= 1 ? `The pin marks your location. The route uses a modeled road point ${fmtD(d)} away in a straight line.` : '';
  hint.hidden = !hint.textContent;
}
const movePin = (which, ll) => {
  if (routeMode && !picking && !isDrawing()) setPoint(which, [ll.lat, ll.lng], 'Pinned point');
  else setPointMarker(which, which === 's' ? state.start : state.end, state.names[which], movePin);
};
function updatePoint(which, ll, name) {
  if (which === 's') { state.start = ll; locationRequest++; } else state.end = ll;
  state.names[which] = name;
  setPointMarker(which, ll, name, movePin);
  const field = $(which === 's' ? 'from' : 'to');
  field.value = name;
  showRoadAccess(which);
}
export function setPoint(which, ll, name) {
  updatePoint(which, ll, name);
  if (picking) setPicking(null);
  emit('route:changed');
}

export function setDefaultPoints() {
  updatePoint('s', PLACES[DEFAULT_START], DEFAULT_START);
  updatePoint('e', PLACES[DEFAULT_END], DEFAULT_END);
  emit('route:changed');
}

function setPicking(which) {
  picking = which;
  setMarkerDragging(routeMode && !picking);
  $('pickStart').setAttribute('aria-pressed', which === 's');
  $('pickEnd').setAttribute('aria-pressed', which === 'e');
  map.getContainer().classList.toggle('picking', !!which);
  setMapHint(which ? `Choose ${which === 's' ? 'start A' : 'destination B'} on the map. Escape cancels.` : '');
}

export function initRoutePoints() {
  on('graph:ready', g => { graph = g; showRoadAccess('s'); showRoadAccess('e'); });
  const click = ll => {
    if (isDrawing()) { handleMapClick(ll); return; }
    if (picking) setPoint(picking, [ll.lat, ll.lng], 'Pinned point');
  };
  map.on('click', e => click(e.latlng));
  const container = map.getContainer();
  container.addEventListener('keydown', e => {
    if (e.target === container && e.key === 'Enter' && (picking || isDrawing())) {
      e.preventDefault();
      click(map.getCenter());
    }
  });
  for (const [id, which] of [['pickStart', 's'], ['pickEnd', 'e']]) {
    $(id).onclick = () => {
      setPicking(picking === which ? null : which);
      if (picking) container.focus({ preventScroll: true });
    };
  }
  on('workspace:changed', mode => {
    routeMode = mode === 'route';
    if (picking && !routeMode) setPicking(null);
    else setMarkerDragging(routeMode && !picking);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && picking) {
      const button = $(picking === 's' ? 'pickStart' : 'pickEnd');
      setPicking(null);
      button.focus();
    }
  });
  $('swap').onclick = () => {
    const { start, end, names } = state, { s, e } = names;
    updatePoint('s', end, e);
    updatePoint('e', start, s);
    if (picking) setPicking(null);
    emit('route:changed');
  };
  $('gps').onclick = () => {
    if (!navigator.geolocation) { setMessage('Location is unavailable in this browser. Choose a place or pick it on the map.'); return; }
    const request = ++locationRequest;
    setMessage('Waiting for your location…');
    navigator.geolocation.getCurrentPosition(p => {
      if (request !== locationRequest) return;
      const ll = [p.coords.latitude, p.coords.longitude];
      setPoint('s', ll, 'My location');
      map.panTo(ll, { animate: false });
    }, () => {
      if (request === locationRequest) setMessage('Could not get your location. Allow access or choose a place.');
    }, { timeout: 12000 });
  };
}
