/* Own the current search, playback, and before/after route snapshots. */
import { state } from '../state.js';
import { on } from '../events.js';
import { $, setMessage } from '../utils/dom.js';
import { ALGORITHMS } from '../algorithms/index.js';
import { lpaReady, lpaReset, lpaRepair } from '../algorithms/lpa-star.js';
import { snapRouteEndpoints, routeMetrics } from '../graph/road-graph.js';
import { removeClosedRoads } from '../graph/closure-filter.js';
import { fitTrip, reducedMotion } from '../map/map.js';
import { exploreLayer } from '../map/explore-layer.js';
import { showHead, moveHead, hideHead, clearRoute, animateRoute, showPreviousRoute } from '../map/route-view.js';
import { refreshControls, setStatus, setCounts, showPlayback, renderRoute, renderImpact, samePath } from '../ui/dashboard.js';
import { renderRepair } from '../ui/results-table.js';
import { getClosures } from './closures.js';
import { selectedAlgorithm } from './algorithm-panel.js';

let base, keepSearch = false;
const stepsPerFrame = () => Math.pow(10, (+$('spd').value - 25) / 25);

function cancelRun() {
  state.runId++;
  cancelAnimationFrame(state.raf);
  state.run = null; state.paused = false;
  refreshControls();
}

function clearSearch() {
  exploreLayer.clear();
  hideHead();
  setCounts(0);
  showPlayback(false);
  keepSearch = false;
}

function invalidate(note) {
  cancelRun(); clearSearch(); clearRoute(); showPreviousRoute(null);
  state.route = state.original = null;
  lpaReset(); renderRepair(null);
  renderRoute(null, note);
  renderImpact(null, null, getClosures());
  setMessage();
  if (base) setStatus(note ? 'Route needs an update' : 'Ready to route');
}

function startRun({ visual = false, changed = false, repair = false } = {}) {
  if (!base) return;
  const prior = changed ? null : state.route || state.run?.prior;
  cancelRun(); setMessage(); clearRoute();
  if (!repair) { clearSearch(); lpaReset(); renderRepair(null); }
  else setCounts(0);
  state.route = null;

  const closures = getClosures();
  showPreviousRoute(state.original?.points);
  renderRoute(null, 'Calculating the current route…');
  renderImpact(null, state.original, closures, changed);
  const { s, t } = snapRouteEndpoints(base, state.start, state.end);
  $('from').setAttribute('aria-invalid', String(s < 0));
  $('to').setAttribute('aria-invalid', String(t < 0));
  if (s < 0 || t < 0) {
    const bad = s < 0 && t < 0 ? 'Start and destination are' : `${s < 0 ? 'Start' : 'Destination'} is`;
    setStatus('Choose a nearby road');
    const note = `${bad} more than 1.5 km from the modeled network. Try a saved place or pick a point closer to a road.`;
    renderRoute(null, note); setMessage(note);
    return;
  }

  const key = selectedAlgorithm(), algo = ALGORITHMS[key], mode = state.mode;
  const animate = visual && !reducedMotion();
  const run = { name: algo.name, mode, closures, changed, repair, visual, prior, count: 0, acc: 0, ms: 0 };
  const start = performance.now();
  try {
    run.graph = algo.handlesClosures ? base : removeClosedRoads(base, closures);
    const begin = repair ? start : performance.now();
    run.it = repair ? lpaRepair(closures) : algo.run(run.graph, s, t, mode, closures);
    run.ms = performance.now() - begin;
    state.run = run;
    showPlayback(visual);
    if (visual) {
      showHead(run.graph, s);
      if (!changed) fitTrip([state.start, state.end]);
    }
    setStatus(repair ? 'LPA* is repairing the route…' : visual ? `${run.name} is searching…` : 'Finding route…');
    refreshControls();
    if (animate) state.raf = requestAnimationFrame(frame);
    else advance(Infinity);
  } catch { failedRun(); }
}

function failedRun() {
  cancelRun(); clearSearch(); lpaReset();
  setStatus('Route calculation failed');
  renderRoute(null, 'Try finding the route again.');
  renderImpact(null, state.original, getClosures(), 'failed');
  setMessage('Try finding the route again. If the problem persists, reload the road network.');
}

function frame() {
  const run = state.run;
  if (!run || state.paused) return;
  run.acc += stepsPerFrame();
  const steps = Math.floor(run.acc);
  run.acc -= steps;
  if (steps) advance(steps);
  if (state.run && !state.paused) state.raf = requestAnimationFrame(frame);
}

function advance(limit) {
  const run = state.run, g = run.graph, render = run.visual;
  const begin = performance.now(), events = [];
  let result, last;
  try {
    for (let i = 0; i < limit; i++) {
      result = run.it.next();
      if (result.done) break;
      run.count++; last = result.value;
      if (render) events.push(last);
    }
    run.ms += performance.now() - begin;

    const point = i => [g.lat[i], g.lng[i]];
    for (const { u, p, found, direction } of events) {
      const kind = direction || 'explored';
      if (run.repair) exploreLayer.add('repair', point(u));
      else {
        for (const v of found) exploreLayer.add(direction || 'frontier', point(v));
        if (p >= 0) exploreLayer.add(kind, point(p), point(u));
      }
    }
    if (last && render) { moveHead(g, last.u); setCounts(run.count, last.q); }
    if (result?.done) finish(run, result.value);
  } catch { failedRun(); }
}

function finish(run, path) {
  state.run = null; state.paused = false; refreshControls(); hideHead();
  keepSearch = run.visual;
  const { graph, mode, closures } = run;
  const points = path?.map(i => [graph.lat[i], graph.lng[i]]);
  state.route = { name: run.name, path, points, mode, closures, ...(path && routeMetrics(graph, path)) };
  if (run.repair) renderRepair({ ...run, path });
  displayRoute(state.route, { changed: run.changed, fit: true, animate: run.visual });
}

function displayRoute(route, { changed = false, fit = false, animate = false } = {}) {
  const { path, points, closures } = route;
  renderRoute(route);
  renderImpact(route, state.original, closures);
  const previous = samePath(state.original?.path, path) ? null : state.original?.points;
  showPreviousRoute(previous);
  if (!path) {
    setStatus('No route available');
    setMessage(closures.length
      ? 'The modeled roads cannot connect these endpoints with the active closures. Reopen a road or choose different endpoints.'
      : 'The modeled roads cannot connect these endpoints. Try a different start or destination.');
  } else {
    setStatus(changed ? 'Route updated' : 'Route found');
    const endpoints = [state.start, state.end];
    if (fit) fitTrip(previous ? [...previous, ...points, ...endpoints] : [...points, ...endpoints]);
    const my = state.runId;
    animateRoute(points, () => my === state.runId, animate);
  }
}

export function initRunController() {
  on('graph:ready', g => {
    base = g; state.graphReady = true;
    setStatus('Ready to route'); refreshControls();
  });
  $('go').onclick = () => startRun();
  $('visualize').onclick = () => startRun({ visual: true });
  $('pause').onclick = () => {
    if (!state.run) return;
    state.paused = !state.paused;
    cancelAnimationFrame(state.raf);
    if (state.paused) setStatus('Search paused');
    else { setStatus(state.run.repair ? 'LPA* is repairing the route…' : `${state.run.name} is searching…`); frame(); }
    refreshControls();
  };
  $('step').onclick = () => { if (state.run && state.paused) advance(1); };
  $('skip').onclick = () => {
    if (!state.run) return;
    cancelAnimationFrame(state.raf);
    advance(Infinity);
  };
  $('reset').onclick = () => { invalidate(); setStatus('Search reset'); };

  on('route:changed', () => invalidate(state.route || state.run ? 'Endpoints changed. Find the route again.' : undefined));
  on('settings:changed', setting => {
    if (setting === 'cost') invalidate('Cost mode changed. Find the route again.');
    else {
      if (state.run) {
        const { changed, prior } = state.run;
        cancelRun();
        if (changed) {
          startRun({ changed: true });
          return;
        }
        if (prior) {
          state.route = prior;
          displayRoute(prior);
          setMessage('Search cancelled. Showing the last completed route.');
        } else {
          setStatus('Search cancelled');
          renderRoute(null, 'Search algorithm changed. Find the route again.');
        }
      }
      lpaReset(); clearSearch(); renderRepair(null);
    }
  });
  on('closures:changed', () => {
    if (!state.route && !state.original && !state.run) return;
    state.original ??= state.route || state.run?.prior || null;
    const repair = !state.run && selectedAlgorithm() === 'lpa' && lpaReady();
    startRun({ changed: true, repair, visual: repair && keepSearch });
  });
}
