/* Draw closure lines, retain their actual directed graph edges, and manage reopening. */
import { map, setMapHint, setLegend } from '../map/map.js';
import { closureDraft, showClosure } from '../map/closure-view.js';
import { $, setMessage } from '../utils/dom.js';
import { hav } from '../utils/geo.js';
import { esc } from '../utils/format.js';
import { blockedEdges, removeClosedRoads } from '../graph/closure-filter.js';
import { emit, on } from '../events.js';

let graph, drawing = false, corner, draft, nextId = 1;
let closures = [];
let routingGraph;
export const getClosures = () => closures;
export const getRoutingGraph = () => routingGraph ??= removeClosedRoads(graph, closures);
export const isDrawing = () => drawing;

function changed() {
  routingGraph = undefined;
  const count = closures.length;
  $('closeClear').disabled = !count;
  $('closeUndo').hidden = !count;
  $('closureEmpty').hidden = !!count;
  $('closureCount').textContent = `Active closures (${count})`;
  $('closureList').innerHTML = closures.map(c => `<li>
    <div><strong>${esc(c.name)}</strong><small>#${c.id} · ${c.count} road ${c.count === 1 ? 'segment' : 'segments'}</small></div>
    <button class="quiet" type="button" data-reopen="${c.id}" aria-label="Reopen closure ${c.id}">Reopen</button>
  </li>`).join('');
  setLegend('closures', !!count);
  emit('closures:changed');
}

function notice(text = '') {
  $('closeHint').textContent = text;
  $('closeHint').hidden = !text;
}

function setDrawing(value) {
  drawing = value;
  corner = null; draft?.remove(); draft = null;
  $('closeDraw').setAttribute('aria-pressed', value);
  $('closeDraw').textContent = value ? 'Cancel drawing' : 'Draw closure';
  map.getContainer().classList.toggle('drawing', value);
  setMapHint(value ? 'Choose the first end of the closure line. Escape cancels.' : '');
  if (value) { notice(); setMessage(); }
}

function reopen(item) {
  if (drawing || !closures.includes(item)) return;
  const restoreFocus = $('closureList').contains(document.activeElement) || document.activeElement === $('closeUndo');
  item.line.remove();
  closures = closures.filter(c => c !== item);
  notice(`Reopened closure #${item.id}.`);
  changed();
  if (restoreFocus) ($('closureList').querySelector('button') || $('closeDraw')).focus();
}

function addClosure(keys, name) {
  const open = [...keys].some(key => closures.every(c => !c.keys.has(key)));
  if (!keys.size || !open) return false;
  const segments = new Map(), size = graph.lat.length;
  for (const key of keys) {
    const u = Math.floor(key / size), v = key % size;
    const pair = Math.min(u, v) * size + Math.max(u, v);
    if (!segments.has(pair)) segments.set(pair, [[graph.lat[u], graph.lng[u]], [graph.lat[v], graph.lng[v]]]);
  }
  const item = { id: nextId++, name, keys, count: segments.size };
  item.line = showClosure([...segments.values()], name, () => reopen(item));
  closures = [...closures, item];
  notice(`Applied closure #${item.id} to ${item.count} road ${item.count === 1 ? 'segment' : 'segments'}.`);
  changed();
  return true;
}

export function handleMapClick(ll) {
  if (!corner) {
    corner = ll;
    draft = closureDraft(ll);
    setMapHint('Choose the other end across the road. Escape cancels.');
    return;
  }
  const a = [corner.lat, corner.lng], b = [ll.lat, ll.lng];
  setDrawing(false);
  if (hav(...a, ...b) < 15) {
    notice('The line must be at least 15 m long. Try a longer line across the road.');
    return;
  }
  const keys = blockedEdges(graph, [{ a, b }]);
  if (!keys.size) notice('That line missed the modeled road network. Try drawing across a visible road.');
  else if (!addClosure(keys, 'Drawn closure')) notice('The selected road segments already belong to active closures.');
}

export function addLinkClosure(keys, name) {
  return addClosure(blockedEdges(graph, [{ keys }]), name);
}

export function initClosures() {
  on('graph:ready', g => { graph = g; routingGraph = undefined; $('closeDraw').disabled = false; });
  on('workspace:changed', mode => { if (drawing && mode !== 'disrupt') setDrawing(false); });
  map.on('mousemove', e => { if (draft) draft.setLatLngs([corner, e.latlng]); });
  $('closeDraw').onclick = () => {
    setDrawing(!drawing);
    if (drawing && document.activeElement === $('closeDraw')) map.getContainer().focus({ preventScroll: true });
  };
  $('closeClear').onclick = () => {
    setDrawing(false);
    closures.forEach(c => c.line.remove());
    closures = [];
    notice('Cleared all closures.');
    changed();
    $('closeDraw').focus();
  };
  $('closeUndo').onclick = () => { if (drawing) setDrawing(false); reopen(closures.at(-1)); };
  $('closureList').onclick = e => {
    const button = e.target.closest('[data-reopen]');
    if (!button) return;
    if (drawing) setDrawing(false);
    reopen(closures.find(c => c.id === +button.dataset.reopen));
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawing) {
      setDrawing(false);
      $('closeDraw').focus();
    }
  });
}
