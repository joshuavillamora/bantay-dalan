/* Store confirmed road closures and manage the shared routing graph. */
import { setLegend } from '../map/map.js';
import { showClosedRoads } from '../map/closure-view.js';
import { $ } from '../utils/dom.js';
import { esc } from '../utils/format.js';
import { blockedEdges, removeClosedRoads } from '../graph/closure-filter.js';
import { roadGeometry } from '../graph/closure-selection.js';
import { emit, on } from '../events.js';
import { cancelClosureTool, initClosureTool } from './closure-tool.js';

let graph, nextId = 1;
let closures = [];
let routingGraph;
export const getClosures = () => closures;
export const getRoutingGraph = () => routingGraph ??= removeClosedRoads(graph, closures);

function changed(notify = true) {
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
  showClosedRoads(closures, reopen);
  setLegend('closures', !!count);
  if (notify) emit('closures:changed');
}

function notice(text = '') {
  $('closeHint').textContent = text;
  $('closeHint').hidden = !text;
}

function reopen(item) {
  if (!closures.includes(item)) return;
  const restoreFocus = $('closureList').contains(document.activeElement) || document.activeElement === $('closeUndo');
  cancelClosureTool();
  $('closeClearPrompt').hidden = true;
  // Rebuild from the remaining closure groups so shared segments stay closed.
  closures = closures.filter(c => c !== item);
  notice(`Reopened closure #${item.id}.`);
  changed();
  if (restoreFocus) ($('closureList').querySelector('button') || $('closeDraw')).focus();
}

function addClosure({ keys, name, segments = roadGeometry(graph, keys) }) {
  if (!keys.size) return false;
  const item = { id: nextId++, name, keys, segments, count: segments.size };
  closures = [...closures, item];
  notice(`Applied closure #${item.id} to ${item.count} road ${item.count === 1 ? 'segment' : 'segments'}.`);
  changed();
  return true;
}

export function addLinkClosure(keys, name) {
  return addClosure({ keys: blockedEdges(graph, [{ keys }]), name });
}

export function initClosures() {
  initClosureTool({ apply: addClosure, notice });
  const clearPrompt = $('closeClearPrompt');
  const dismissClear = () => { clearPrompt.hidden = true; };
  on('graph:ready', g => {
    const switched = graph && graph !== g;
    graph = g;
    if (!switched) return;
    cancelClosureTool();
    dismissClear();
    closures = [];
    nextId = 1;
    notice();
    changed(false);
  });
  on('workspace:changed', mode => { if (mode !== 'disrupt') dismissClear(); });
  $('closeDraw').addEventListener('click', dismissClear);
  $('closeClear').onclick = () => {
    if (!closures.length) return;
    cancelClosureTool();
    clearPrompt.hidden = false;
    $('closeClearApply').focus();
  };
  $('closeClearCancel').onclick = () => {
    dismissClear();
    $('closeClear').focus();
  };
  clearPrompt.addEventListener('keydown', event => {
    if (event.key === 'Escape') $('closeClearCancel').click();
  });
  $('closeClearApply').onclick = () => {
    dismissClear();
    closures = [];
    notice('Cleared all closures.');
    changed();
    $('closeDraw').focus();
  };
  $('closeUndo').onclick = () => reopen(closures.at(-1));
  $('closureList').onclick = e => {
    const button = e.target.closest('[data-reopen]');
    if (!button) return;
    reopen(closures.find(c => c.id === +button.dataset.reopen));
  };
}
