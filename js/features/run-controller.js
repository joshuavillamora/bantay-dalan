/* Runs a search: starts it, animates it frame by frame, handles pause / step / skip / reset,
   shows the result, and repairs LPA* routes when closures change. */
import { state } from '../state.js';
import { on } from '../events.js';
import { $, setMessage } from '../utils/dom.js';
import { ALGORITHMS } from '../algorithms/index.js';
import { lpaReady, lpaReset, lpaInfo, lpaRepair } from '../algorithms/lpa-star.js';
import { loadGraph, nearestNode, routeMetrics } from '../graph/road-graph.js';
import { removeClosedRoads } from '../graph/closure-filter.js';
import { map, fitPad } from '../map/map.js';
import { exploreLayer } from '../map/explore-layer.js';
import { showHead, moveHead, hideHead, clearRoute, cancelRouteAnimation, animateRoute } from '../map/route-view.js';
import { refreshControls, setStatus, setCounts, setRouteStats, resetStats } from '../ui/dashboard.js';
import { addResult, clearResults } from '../ui/results-table.js';
import { getClosures } from './closures.js';
import { selectedAlgorithm } from './algorithm-panel.js';

const stepsPerFrame = () => Math.pow(10, (+$('spd').value - 25) / 25);   // 0.1 … 1000

function cancelRun() {
  state.runId++; cancelAnimationFrame(state.raf); cancelRouteAnimation();
  state.run = null; state.paused = false; state.loading = false; refreshControls();
}
function clearDrawing() { exploreLayer.clear(); clearRoute(); resetStats(); }

async function startRun() {
  cancelRun(); clearDrawing(); setMessage('');
  if (!state.start || !state.end) { setMessage('Choose both a start and a destination.'); return; }
  const my = state.runId, key = selectedAlgorithm(), algo = ALGORITHMS[key], mode = state.mode;
  state.loading = true; refreshControls(); setStatus('Loading road network…');
  map.fitBounds([state.start, state.end], fitPad());
  let g;
  try { const base = await loadGraph(); g = algo.handlesClosures ? base : removeClosedRoads(base, getClosures()); }
  catch (e) {
    if (my === state.runId) {
      setMessage('Could not load road data (' + e.message + '). Make sure data/iloilo-roads.json exists and the page is served by a local server.');
      setStatus('Ready'); state.loading = false; refreshControls();
    }
    return;
  }
  if (my !== state.runId) return;
  state.loading = false;
  const a = nearestNode(g, state.start), b = nearestNode(g, state.end);
  if (a.i < 0 || b.i < 0 || Math.min(a.d, b.d) > 1500) { setMessage('No road found near one of the points. Move the pin closer to a road.'); setStatus('Ready'); refreshControls(); return; }
  showHead(g, a.i);
  state.run = { g, it: algo.run(g, a.i, b.i, mode, getClosures()), count: 0, acc: 0, algo: key, mode, my };
  state.paused = false; setStatus(algo.name + ' is searching…'); refreshControls(); frame();
}

function frame() {
  state.raf = null;
  const run = state.run; if (!run || state.paused) return;
  run.acc += stepsPerFrame(); const n = Math.floor(run.acc); run.acc -= n;
  if (n > 0) advance(n);
  if (state.run && !state.paused) state.raf = requestAnimationFrame(frame);
}

function advance(n) {
  const run = state.run, g = run.g; let r = null, last = null;
  for (let i = 0; i < n; i++) {
    r = run.it.next(); if (r.done) break;
    const { u, p, found } = r.value; run.count++; last = r.value;
    for (const f of found) exploreLayer.add([g.lat[f], g.lng[f]]);
    if (p >= 0) exploreLayer.add([g.lat[p], g.lng[p], g.lat[u], g.lng[u]]);
  }
  if (last) { moveHead(g, last.u); setCounts(run.count, last.q); } else setCounts(run.count);
  if (r && r.done) { state.run = null; state.paused = false; refreshControls(); finish(g, r.value, run); }
}

function finish(g, path, run) {
  hideHead();
  if (!path) { setStatus('No route found'); setMessage('These points are not connected by the downloaded roads. Try points closer together or nearer a main road.'); return; }
  const { dist, time } = routeMetrics(g, path);
  setRouteStats(dist, time); setStatus('Route found');
  addResult({ name: ALGORITHMS[run.algo].name + (run.replan ? ' (replan)' : ''), mode: run.mode, n: run.count, dist, time });
  animateRoute(path.map(i => [g.lat[i], g.lng[i]]), () => run.my === state.runId);
}

/* a closure changed after an LPA* run: repair the old search instead of restarting */
function replanLPA() {
  const { g, s, mode } = lpaInfo(), it = lpaRepair(getClosures());
  cancelRun(); clearDrawing(); setMessage('');
  showHead(g, s);
  state.run = { g, it, count: 0, acc: 0, algo: 'lpa', mode, my: state.runId, replan: true };
  setStatus('LPA* is repairing the route…'); refreshControls(); frame();
}

export function initRunController() {
  $('go').onclick = startRun;
  $('pause').onclick = () => {
    if (!state.run) return;
    state.paused = !state.paused;
    if (state.paused) { cancelAnimationFrame(state.raf); setStatus('Paused'); }
    else { setStatus(ALGORITHMS[state.run.algo].name + ' is searching…'); frame(); }
    refreshControls();
  };
  $('step').onclick = () => { if (state.run && state.paused) advance(1); };
  $('skip').onclick = () => { if (state.run) { cancelAnimationFrame(state.raf); state.paused = false; advance(Infinity); } };
  $('reset').onclick = () => { cancelRun(); clearDrawing(); setMessage(''); lpaReset(); };

  on('route:changed', () => { clearResults(); lpaReset(); });          // new points: old comparison no longer applies
  on('settings:changed', lpaReset);                                    // new algorithm or mode: forget the LPA* search
  on('closures:changed', () => {
    if (selectedAlgorithm() === 'lpa' && lpaReady()) { replanLPA(); return; }   // repair, keep results
    lpaReset(); cancelRun(); clearDrawing(); clearResults(); setMessage('');
  });
}
