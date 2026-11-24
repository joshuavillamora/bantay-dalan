/* Run the sampled impact analysis and tie results to the closure snapshot it used. */
import { showChokepoints, focusChokepoint, clearChokepoints } from '../map/chokepoint-view.js';
import { $, setMessage } from '../utils/dom.js';
import { esc, fmtClosureCount } from '../utils/format.js';
import { PLACES, CHOKEPOINTS } from '../config.js';
import { nearestRoadVertex } from '../graph/road-graph.js';
import { findChokepoints } from '../analysis/chokepoints.js';
import { getClosures, getRoutingGraph, addLinkClosure } from './closures.js';
import { on } from '../events.js';

let base, results = [], controller, shown = false, cached;
const status = text => { $('chokeHint').textContent = text; };
const mins = s => (s / 60).toFixed(1);

function render() {
  $('chokeClear').hidden = !results.length;
  $('chokeClear').textContent = shown ? 'Hide highlights' : 'Show highlights';
  $('chokeList').innerHTML = results.map((c, i) => {
    const name = c.name.startsWith('Unnamed ') ? `${c.name} · link ${c.key.replaceAll(':', '–')}` : c.name;
    const detour = c.rerouted ? ` · +${mins(c.avgExtra)} min avg. detour` : '';
    return `<li><span class="rank" aria-hidden="true">${i + 1}</span>
      <button type="button" class="choke-preview" data-preview="${i}" aria-pressed="false">
        <strong>${esc(name)}</strong>
        <small>${c.used}/${c.total} sampled trips · ${c.cut} unreachable${detour}</small>
        <small>Impact score ${mins(c.score)} min</small>
      </button>
      <button type="button" class="quiet" data-close="${i}" aria-label="Simulate closure of ${esc(name)}">Simulate</button>
    </li>`;
  }).join('');
}

async function analyze() {
  if (controller || !base) return;
  const closures = getClosures();
  if (cached?.closures === closures) {
    display(cached);
    return;
  }
  controller = new AbortController();
  const { signal } = controller;
  $('chokeBtn').disabled = true;
  $('chokeCancel').hidden = false;
  results = []; shown = false; render(); clearChokepoints();
  status('Preparing sampled trips…');
  try {
    const graph = getRoutingGraph();
    const demand = CHOKEPOINTS.places.map(name => ({ name, i: nearestRoadVertex(graph, PLACES[name], base).i })).filter(d => d.i >= 0);
    const { chokepoints, trips, examined } = await findChokepoints(graph, demand, {
      candidates: CHOKEPOINTS.candidates, topK: CHOKEPOINTS.topK, penalty: CHOKEPOINTS.disconnectPenaltySec, signal,
      onProgress: (what, done, total) => { if (getClosures() === closures) status(`${what}… ${done}/${total}`); }
    });
    if (signal.aborted) return;
    display(cached = { closures, chokepoints, trips, examined });
  } catch {
    if (!signal.aborted) status('Could not analyze the road network. Try finding critical roads again.');
  } finally {
    const restoreFocus = document.activeElement === $('chokeCancel');
    controller = null;
    $('chokeCancel').hidden = true;
    $('chokeBtn').disabled = false;
    if (restoreFocus) $('chokeBtn').focus();
  }
}

function display({ closures, chokepoints, trips, examined }) {
  results = chokepoints; shown = !!results.length; render();
  if (shown && !$('analyzePanel').hidden && !$('panel').hidden) showChokepoints(results);
  const scope = `${examined} links tested · ${trips} routed trips · ${fmtClosureCount(closures.length)}.`;
  status(results.length ? scope : `${scope} No tested closure increased the score.`);
}

export function initChokepoints() {
  on('graph:ready', g => { base = g; cached = undefined; $('chokeBtn').disabled = false; });
  on('workspace:changed', mode => {
    if (mode === 'analyze' && shown) {
      $('chokeList').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      showChokepoints(results);
    }
    else clearChokepoints();
  });
  on('closures:changed', () => {
    cached = undefined;
    if (!results.length && !controller) return;
    controller?.abort();
    results = []; shown = false; render(); clearChokepoints();
    status('Closures changed. Run the analysis again for an updated ranking.');
  });

  $('chokeBtn').onclick = analyze;
  $('chokeCancel').onclick = () => { controller?.abort(); status('Analysis cancelled.'); };
  $('chokeClear').onclick = () => {
    shown = !shown;
    if (shown) showChokepoints(results); else clearChokepoints();
    $('chokeClear').textContent = shown ? 'Hide highlights' : 'Show highlights';
    $('chokeList').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
  };
  $('chokeList').onclick = e => {
    const close = e.target.closest('[data-close]');
    if (close) {
      const c = results[+close.dataset.close];
      if (addLinkClosure(c.keys, c.name)) {
        setMessage(`Closed ${c.name}. Open Disrupt to review the closure and route impact.`);
        $('chokeBtn').focus();
      }
      return;
    }
    const preview = e.target.closest('[data-preview]');
    if (preview) {
      if (!shown) { shown = true; showChokepoints(results); $('chokeClear').textContent = 'Hide highlights'; }
      $('chokeList').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      preview.setAttribute('aria-pressed', 'true');
      focusChokepoint(+preview.dataset.preview);
    }
  };
}
