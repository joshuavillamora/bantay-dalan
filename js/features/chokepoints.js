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
const status = (text, announcedOnly = false) => {
  $('chokeHint').classList.toggle('sr', announcedOnly);
  $('chokeHint').textContent = text;
};
const mins = s => (s / 60).toFixed(1);

function render() {
  $('chokeClear').hidden = !results.length;
  $('chokeClear').textContent = shown ? 'Hide highlights' : 'Show highlights';
  $('chokeList').innerHTML = results.map((c, i) => {
    const name = c.name;
    const detour = c.rerouted ? `+${mins(c.avgExtra)} min average delay on detours` : '';
    return `<li><span class="rank" aria-hidden="true">${i + 1}</span>
      <button type="button" class="choke-preview" data-preview="${i}" aria-pressed="false">
        <strong>${esc(name)}</strong>
        <small>${c.used}/${c.total} sampled trips affected · ${c.cut} unreachable</small>
        ${detour ? `<small>${detour}</small>` : ''}
        <small class="impact-score">${mins(c.score)} min · criticality score</small>
      </button>
      <button type="button" class="quiet" data-close="${i}" aria-label="Simulate closure of ${esc(name)}">Simulate</button>
      <details class="link-detail"><summary>Technical details</summary><p>Graph link <code>${esc(c.key)}</code></p></details>
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
  const job = controller = new AbortController();
  const { signal } = job;
  $('chokeBtn').disabled = true;
  $('chokeCancel').hidden = false;
  results = []; shown = false; render(); clearChokepoints();
  $('analysisMetrics').hidden = true;
  status('Preparing sampled trips…');
  try {
    const graph = getRoutingGraph();
    const points = base.region?.demand;
    const demand = points
      ? points.map((i, index) => ({ name: `Sample ${index + 1}`, i }))
      : CHOKEPOINTS.places.map(name => ({ name, i: nearestRoadVertex(graph, PLACES[name], base).i })).filter(d => d.i >= 0);
    const { chokepoints, trips, examined } = await findChokepoints(graph, demand, {
      candidates: CHOKEPOINTS.candidates, topK: CHOKEPOINTS.topK, penalty: CHOKEPOINTS.disconnectPenaltySec, signal,
      onProgress: (what, done, total) => { if (!signal.aborted && getClosures() === closures) status(`${what}… ${done}/${total}`); }
    });
    if (signal.aborted) return;
    display(cached = { closures, chokepoints, trips, examined });
  } catch {
    if (!signal.aborted) status('Could not analyze the road network. Try finding critical roads again.');
  } finally {
    if (controller === job) {
      const restoreFocus = document.activeElement === $('chokeCancel');
      controller = null;
      $('chokeCancel').hidden = true;
      $('chokeBtn').disabled = false;
      if (restoreFocus) $('chokeBtn').focus();
    }
  }
}

function display({ closures, chokepoints, trips, examined }) {
  results = chokepoints; shown = !!results.length; render();
  $('linksTested').textContent = examined;
  $('sampledTrips').textContent = trips;
  $('analysisClosures').textContent = closures.length;
  $('analysisMetrics').hidden = false;
  if (shown && !$('analyzePanel').hidden && !$('panel').hidden) showChokepoints(results);
  const scope = `${examined} links tested · ${trips} routed trips · ${fmtClosureCount(closures.length)}.`;
  status(results.length ? scope : `${scope} No tested closure increased the score.`, !!results.length);
}

export function initChokepoints() {
  on('graph:ready', g => {
    controller?.abort();
    controller = cached = undefined;
    base = g;
    results = []; shown = false; render(); clearChokepoints();
    $('chokeCancel').hidden = true;
    $('chokeBtn').disabled = false;
    $('analysisScope').textContent = g.region?.demand
      ? `Rank tested links for ${g.region.name} using ${g.region.demand.length} sampled road points.`
      : 'Rank tested road links by their impact on sampled trips between Iloilo landmarks.';
    $('analysisMetrics').hidden = true;
    $('chokeBtn').textContent = 'Find critical roads';
    status('');
  });
  on('workspace:changed', mode => {
    if (mode === 'analyze' && shown) {
      $('chokeList').querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      showChokepoints(results);
    }
    else clearChokepoints();
  });
  on('closures:changed', () => {
    const hadAnalysis = !!cached || !!controller;
    cached = undefined;
    if (!hadAnalysis) return;
    controller?.abort();
    results = []; shown = false; render(); clearChokepoints();
    $('analysisMetrics').hidden = true;
    $('chokeBtn').textContent = 'Recalculate analysis';
    status('Analysis outdated · closures changed');
  });

  $('chokeBtn').onclick = () => {
    $('chokeBtn').textContent = 'Find critical roads';
    analyze();
  };
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
