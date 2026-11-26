/* Own the current search, playback, and before/after route snapshots. */
import { state } from '../state.js';
import { emit, on } from '../events.js';
import { $, setMessage } from '../utils/dom.js';
import { ALGORITHMS } from '../algorithms/index.js';
import { lpaReady, lpaReset, lpaRepair, lpaSettledLabels, lpaRetainedVertices } from '../algorithms/lpa-star.js';
import { prepareReverseAdjacency, snapRouteEndpoints, snapRoutePoint, routeMetrics } from '../graph/road-graph.js';
import { blockedEdges } from '../graph/closure-filter.js';
import { fitTrip } from '../map/map.js';
import { exploreLayer } from '../map/explore-layer.js';
import { showHead, moveHead, hideHead, clearRoute, animateRoute, showPreviousRoute } from '../map/route-view.js';
import { refreshControls, setStatus, setCounts, showPlayback, renderRoute, renderImpact, samePath } from '../ui/dashboard.js';
import { renderInitialLpa, renderRepair } from '../ui/results-table.js';
import { getClosures, getRoutingGraph } from './closures.js';
import { selectedAlgorithm } from './algorithm-panel.js';
import { connectionMessage, noRouteMessage } from './route-status.js';
import { cancelRegionLoad, currentTripGraph, prepareTripRegion } from './routing-region.js';
import { createSearchTrace } from './search-trace.js';

let base, searchView;
const stepsPerFrame = () => Math.pow(10, (+$('spd').value - 25) / 25);
function showRunStatus(run) {
  // The generator computes while yielding steps to the map. There is no
  // second replay of a finished computation behind this status.
  setStatus(run.preparing ? 'Preparing road directions…'
    : run.repair ? 'LPA* is repairing the route…'
    : run.visual && !run.skip ? `Visualizing ${run.name} search…`
    : 'Computing route…');
}

function cancelRun() {
  state.runId++;
  cancelAnimationFrame(state.raf);
  state.run = null; state.paused = false;
  refreshControls();
}

function clearSearch() {
  searchView = null;
  exploreLayer.clear();
  hideHead();
  setCounts(0);
  showPlayback(false);
}

function invalidate(note) {
  const outdated = state.run && note;
  cancelRun(); clearSearch(); clearRoute(); showPreviousRoute(null);
  state.route = state.original = null;
  lpaReset(); renderInitialLpa(); renderRepair(null);
  renderRoute(null, note);
  renderImpact(null, null, getClosures());
  setMessage();
  if (base) setStatus(outdated ? 'Outdated route calculation discarded' : note ? 'Route needs an update' : 'Ready to route');
}

function startRun({ visual = false, changed = false, repair = false, animate = visual } = {}) {
  if (!base) return;
  const prior = changed ? null : state.route || state.run?.prior;
  const previousRepairRoute = repair ? state.route?.points : null;
  cancelRun(); setMessage(); clearRoute();
  clearSearch(); renderRepair(null);
  if (!repair) { lpaReset(); renderInitialLpa(); }
  state.route = null;

  const closures = getClosures();
  try { showPreviousRoute(repair ? previousRepairRoute : state.original?.points); }
  catch (error) { console.error('Original route visualization failed', error); }
  renderRoute(null, 'Calculating the current route…');
  renderImpact(null, state.original, closures, changed);
  const { s, t } = snapRouteEndpoints(base, state.start, state.end);
  $('from').setAttribute('aria-invalid', String(s < 0));
  $('to').setAttribute('aria-invalid', String(t < 0));
  if (s < 0 || t < 0) {
    const invalid = s < 0 ? state.start : state.end;
    const message = connectionMessage(snapRoutePoint(base, invalid).reason);
    setStatus('Endpoint unavailable');
    renderRoute(null, message); setMessage(message);
    return;
  }

  const key = selectedAlgorithm(), algo = ALGORITHMS[key], mode = state.mode;
  const run = { id: state.runId, key, name: algo.name, s, t, mode, closures, changed, repair, visual, animate, prior, previousRepairRoute,
    usesClosureKeys: algo.handlesClosures, count: 0, backward: 0, acc: 0, ms: 0 };
  if (key === 'lpa') run.trace = createSearchTrace();
  if (repair) {
    run.priorLabels = lpaSettledLabels();
    run.processed = new Uint8Array(base.lat.length);
  }
  const start = performance.now();
  try {
    run.graph = algo.handlesClosures ? base : getRoutingGraph();
    const begin = repair ? start : performance.now();
    if (repair) run.it = lpaRepair(closures);
    else if (algo.handlesClosures) run.it = algo.run(run.graph, s, t, mode, closures);
    else run.it = algo.run(run.graph, s, t, mode);
    run.ms = performance.now() - begin;
  } catch (error) {
    failedRun(error);
    return;
  }
  state.run = run;
  showPlayback(visual);
  if (visual) {
    searchView = run;
    try {
      showHead(run.graph, s);
      if (!changed) fitTrip([state.start, state.end]);
    } catch (error) {
      failedSearchView(error);
    }
  }
  run.preparing = key !== 'astar' && !run.graph.radj;
  showRunStatus(run);
  refreshControls();
  if (run.preparing) {
    prepareReverseAdjacency(run.graph).then(() => {
      if (state.run !== run) return;
      run.preparing = false;
      refreshControls();
      if (!state.paused) {
        showRunStatus(run);
        state.raf = requestAnimationFrame(frame);
      }
    }, error => { if (state.run === run) failedRun(error); });
  } else state.raf = requestAnimationFrame(frame);
}

function failedRun(error) {
  console.error('Route calculation failed', error);
  cancelRun(); clearSearch(); lpaReset();
  setStatus('Route calculation failed');
  renderRoute(null, 'Try finding the route again.');
  renderImpact(null, state.original, getClosures(), 'failed');
  setMessage('Try finding the route again. If the problem persists, reload the road network.');
}

function failedSearchView(error) {
  if (!searchView || searchView.id !== state.runId || searchView.viewFailed) return;
  console.error('Search visualization failed', error);
  searchView.viewFailed = true;
  searchView.animate = false;
  hideHead();
  if (!searchView.routeViewFailed) {
    setMessage([state.route?.failure, 'Search visualization failed.'].filter(Boolean).join(' '));
  }
}

function frame() {
  const run = state.run;
  if (!run || run.preparing || state.paused) return;
  let steps = Infinity;
  if (run.animate && !run.skip) {
    run.acc += stepsPerFrame();
    steps = Math.floor(run.acc);
    run.acc -= steps;
  }
  if (steps) advance(steps, !run.skip, performance.now() + 8);
  if (state.run && !state.paused) state.raf = requestAnimationFrame(frame);
}

function advance(limit, paint = true, deadline = Infinity) {
  const run = state.run, render = run.visual && (paint || run.repair) && !run.viewFailed;
  const begin = performance.now(), events = [];
  let result, last, route;
  try {
    for (let i = 0; i < limit; i++) {
      if (i && !(i % 32) && performance.now() >= deadline) break;
      result = run.it.next();
      if (result.done) break;
      run.count++; last = result.value;
      if (last.direction === 'backward') run.backward++;
      if (render || run.trace) {
        if (!run.trace && events.length === 8000) events.splice(0, 4000);
        events.push(last);
      }
    }
    run.ms += performance.now() - begin;
    run.trace?.record(events);
    if (run.repair) {
      for (const { u } of events) run.processed[u] = 1;
    }
    if (result?.done) route = routeResult(run, result.value);
  } catch (error) {
    failedRun(error);
    return;
  }

  if (render) {
    try {
      const g = run.graph, point = i => [g.lat[i], g.lng[i]];
      const drawn = run.trace && !run.repair && events.length > 8000 ? events.slice(-8000) : events;
      for (const { u, p, found, direction } of drawn) {
        const kind = direction || run.key;
        if (run.repair) exploreLayer.add('repair', point(u));
        else {
          for (const v of found) exploreLayer.add(kind, point(v), undefined, true);
          exploreLayer.add(kind, p >= 0 ? point(p) : point(u), p >= 0 ? point(u) : undefined);
        }
      }
      if (last) moveHead(g, last.u);
    } catch (error) {
      failedSearchView(error);
    }
  }
  if (last && run.visual) setCounts(run.count, last.q, run.key === 'bidir' ? run.backward : undefined);
  if (route) finish(run, route);
}

function routeResult(run, path) {
  const { graph, s, t, mode, closures } = run;
  const points = path?.map(i => [graph.lat[i], graph.lng[i]]);
  const failure = path ? null : noRouteMessage(base, s, t, mode, closures.length > 0);
  const metrics = path && routeMetrics(graph, path, run.usesClosureKeys ? blockedEdges(graph, closures) : undefined);
  return { name: run.name, path, points, mode, closures, failure, ...metrics };
}

function finish(run, route) {
  state.run = null; state.paused = false; refreshControls();
  state.route = route;
  const trace = run.trace;
  run.trace = null;
  if (run.repair) {
    const { graph, s, t, mode, closures, count, ms } = run;
    const retained = run.priorLabels ? lpaRetainedVertices(run.priorLabels, run.processed) : [];
    if (!run.viewFailed) exploreLayer.setRetained(graph, retained);
    const detail = { context: { graph, s, t, mode, closures }, count, ms, path: route.path, dist: route.dist, time: route.time,
      trace, uniqueNodes: trace.uniqueNodes(), retained, previous: run.previousRepairRoute };
    renderRepair(detail);
    emit('repair:ready', detail);
  } else if (trace) renderInitialLpa({ count: run.count, uniqueNodes: trace.uniqueNodes() });
  displayRoute(route, run);
}

function displayRoute(route, run, cancelled = false) {
  const { path, points, failure } = route;
  renderRoute(route);
  renderImpact(route, state.original, route.closures);
  const previous = run?.repair ? run.previousRepairRoute
    : samePath(state.original?.path, path) ? null : state.original?.points;
  if (cancelled) setStatus('Search cancelled · Previous result shown');
  else if (path) setStatus(run?.changed ? 'Route updated' : 'Route found');
  else setStatus('No route available');
  setMessage([failure, run?.viewFailed && 'Search visualization failed.'].filter(Boolean).join(' '));

  const id = state.runId;
  const stillCurrent = () => id === state.runId;
  const onError = error => {
    if (!stillCurrent()) return;
    console.error('Route visualization failed', error);
    if (run) run.routeViewFailed = true;
    if (path) {
      setStatus('Route found · Visualization failed');
      setMessage('The calculated route is available in Route. Try finding it again to display it on the map.');
    }
    clearRoute();
  };
  try {
    hideHead();
    showPreviousRoute(previous);
  } catch (error) {
    console.warn('Could not update the reference map overlays.', error);
  }
  if (!path) return;
  if (run) {
    const endpoints = [state.start, state.end];
    try { fitTrip(previous ? [...previous, ...points, ...endpoints] : [...points, ...endpoints]); }
    catch (error) { console.warn('Could not fit the map to the route.', error); }
  }
  try { animateRoute(points, { stillCurrent, animate: run?.visual, onError }); }
  catch (error) { onError(error); }
}

export function initRunController() {
  exploreLayer.on('error', ({ error }) => failedSearchView(error));
  on('graph:ready', g => {
    if (base && base !== g) invalidate();
    base = g; state.graphReady = true;
    setStatus('Ready to route'); refreshControls();
  });
  async function requestedRun(visual) {
    if (currentTripGraph()) { startRun({ visual }); return; }
    const { graph, message, reason } = await prepareTripRegion();
    if (graph) startRun({ visual });
    else if (message) {
      invalidate(message);
      const heading = { disconnected: 'No route available', differentRegions: 'No route available', loadFailed: 'Road network unavailable' };
      setStatus(heading[reason] || 'Endpoint unavailable');
      setMessage(message);
    }
  }
  $('go').onclick = () => requestedRun(false);
  $('visualize').onclick = () => requestedRun(true);
  $('pause').onclick = () => {
    if (!state.run) return;
    state.paused = !state.paused;
    cancelAnimationFrame(state.raf);
    if (state.paused) setStatus('Search paused');
    else { showRunStatus(state.run); frame(); }
    refreshControls();
  };
  $('step').onclick = () => { if (state.run && !state.run.preparing && state.paused) advance(1); };
  $('skip').onclick = () => {
    if (!state.run) return;
    cancelAnimationFrame(state.raf);
    state.run.skip = true;
    state.paused = false;
    showRunStatus(state.run);
    refreshControls();
    if (!state.run.preparing) state.raf = requestAnimationFrame(frame);
  };
  $('reset').onclick = () => { cancelRegionLoad(); invalidate(); setStatus('Search reset'); };

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
          displayRoute(prior, undefined, true);
        } else {
          setStatus('Search cancelled');
          renderRoute(null, 'Search algorithm changed. Find the route again.');
        }
      }
      lpaReset(); clearSearch(); renderInitialLpa(); renderRepair(null);
    }
  });
  on('closures:changed', () => {
    if (!state.route && !state.original && !state.run) return;
    state.original ??= state.route || state.run?.prior || null;
    const repair = !state.run && selectedAlgorithm() === 'lpa' && lpaReady();
    startRun({ changed: true, repair, visual: repair, animate: repair && !!searchView && !searchView.viewFailed });
  });
}
