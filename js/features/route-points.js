/* Start and destination: map clicks, swap button, "use my location", and the default points. */
import { state } from '../state.js';
import { map } from '../map/map.js';
import { setPointMarker } from '../map/markers.js';
import { $, setMessage } from '../utils/dom.js';
import { PLACES, DEFAULT_START, DEFAULT_END } from '../config.js';
import { emit } from '../events.js';
import { isDrawing, handleMapClick } from './closures.js';

export function setPoint(which, ll, name) {
  if (which === 's') state.start = ll; else state.end = ll;
  state.names[which] = name;
  setPointMarker(which, ll, name);
  $(which === 's' ? 'from' : 'to').value = name;
  emit('route:changed');
}

export function setDefaultPoints() {
  setPoint('s', PLACES[DEFAULT_START], DEFAULT_START);
  setPoint('e', PLACES[DEFAULT_END], DEFAULT_END);
}

export function initRoutePoints() {
  map.on('click', e => {
    if (isDrawing()) { handleMapClick(e.latlng); return; }   // the closure tool owns clicks while it is on
    const ll = [e.latlng.lat, e.latlng.lng];
    setPoint(state.clickState === 0 ? 's' : 'e', ll, 'Pinned point');
    state.clickState = 1 - state.clickState;
  });
  $('swap').onclick = () => {
    $('swap').classList.toggle('flipped');
    const a = state.start, an = state.names.s, b = state.end, bn = state.names.e;
    if (b) setPoint('s', b, bn);
    if (a) setPoint('e', a, an);
  };
  $('gps').onclick = () => {
    if (!navigator.geolocation) { setMessage('Geolocation is not supported in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setPoint('s', [p.coords.latitude, p.coords.longitude], 'My location'); map.panTo([p.coords.latitude, p.coords.longitude]); },
      () => setMessage('Could not get your location. Allow location access and try again.'));
  };
}
