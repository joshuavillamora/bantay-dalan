/* Road closures: the user draws red lines across roads; clicking a line reopens it.
   This module owns the list of closures and the drawing tool, and emits 'closures:changed'. */
import { map } from '../map/map.js';
import { $, setMessage } from '../utils/dom.js';
import { hav } from '../utils/geo.js';
import { emit } from '../events.js';

let closures = [], drawing = false, corner = null, draft = null;
const HINT = 'Draw a red line across a road to close it. Click a line to reopen it.';

export const getClosures = () => closures;     // [{ a:[lat,lng], b:[lat,lng], line } or { keys:Set, line }]
export const isDrawing = () => drawing;

function changed() {
  $('closeClear').disabled = !closures.length;
  $('closeDraw').textContent = 'Close a road' + (closures.length ? ` (${closures.length})` : '');
  emit('closures:changed');
}
function setDrawing(v) {
  drawing = v; corner = null; if (draft) { draft.remove(); draft = null; }
  $('closeDraw').classList.toggle('on', v); $('closeDraw').setAttribute('aria-pressed', v);
  map.getContainer().classList.toggle('drawing', v);
  $('closeHint').textContent = v ? 'Click where the closure starts, then where it ends. Esc cancels.' : HINT;
}

/* called by the map click handler while the drawing tool is on */
export function handleMapClick(ll) {
  if (!corner) {
    corner = ll;
    draft = L.polyline([ll, ll], { className: 'closure draft', interactive: false }).addTo(map);
    return;
  }
  const c = corner; setDrawing(false);
  const a = [c.lat, c.lng], b = [ll.lat, ll.lng];
  if (hav(a[0], a[1], b[0], b[1]) < 15) { setMessage('That line is too short. Click further away.'); return; }
  const line = L.polyline([a, b], { className: 'closure' }).addTo(map).bindTooltip('Road closed · click to reopen', { sticky: true });
  const item = { a, b, line }; closures.push(item);
  line.on('click', ev => {
    if (drawing) return;
    L.DomEvent.stopPropagation(ev);   // don't also drop a pin
    line.remove(); closures = closures.filter(x => x !== item); changed();
  });
  changed();
}

/* close a whole road link (used by the chokepoint list): coords = [[lat,lng],...], keys = Set of directed edge codes */
export function addLinkClosure(coords, keys) {
  const line = L.polyline(coords, { className: 'closure' }).addTo(map).bindTooltip('Road closed · click to reopen', { sticky: true });
  const item = { keys, line }; closures.push(item);
  line.on('click', ev => {
    if (drawing) return;
    L.DomEvent.stopPropagation(ev);
    line.remove(); closures = closures.filter(x => x !== item); changed();
  });
  changed();
}

export function initClosures() {
  map.on('mousemove', e => { if (drawing && corner && draft) draft.setLatLngs([corner, e.latlng]); });
  $('closeDraw').onclick = () => setDrawing(!drawing);
  $('closeClear').onclick = () => { closures.forEach(c => c.line.remove()); closures = []; changed(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawing) setDrawing(false); });
  setDrawing(false);   // sets the starting hint text
}
