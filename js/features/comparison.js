/* Fresh runs share a graph snapshot and leave interactive LPA* state alone. */
import { ALGORITHMS } from '../algorithms/index.js';
import { lpaFresh } from '../algorithms/lpa-star.js';
import { prepareReverseAdjacency, routeMetrics, snapRouteEndpoints, snapRoutePoint } from '../graph/road-graph.js';
import { nextTask, runInSlices } from '../utils/work-slices.js';
import { state } from '../state.js';
import { on } from '../events.js';
import { $ } from '../utils/dom.js';
import { costsAgree, matchingRepair, renderResults } from '../ui/results-table.js';
import { getClosures, getRoutingGraph } from './closures.js';
import { connectionMessage, noRouteMessage } from './route-status.js';
import { currentTripGraph, prepareTripRegion } from './routing-region.js';
import { createSearchTrace, sameSearchContext } from './search-trace.js';
import { initComparisonReplay } from './comparison-replay.js';

const initialStatus = 'Compare three routing algorithms against the Dijkstra baseline.';

export function initComparison() {
  const replay = initComparisonReplay();
  let base, comparison, generation = 0;
  const statusNode = $('comparisonStatus');
  const status = text => { statusNode.textContent = text; };
  function invalidate() {
    generation++;
    comparison = undefined;
    replay.set();
    if (base && $('compareBtn').disabled) status('Outdated comparison discarded. Run a new comparison.');
    else if (statusNode.textContent !== initialStatus) status('Trip settings or closures changed. Run a new comparison.');
    renderResults();
    $('compareBtn').disabled = !base;
  }

  on('graph:ready', graph => {
    if (base && base !== graph) { invalidate(); status(initialStatus); }
    base = graph; $('compareBtn').disabled = false;
  });
  on('route:changed', invalidate);
  on('closures:changed', invalidate);
  on('settings:changed', setting => { if (setting === 'cost') invalidate(); });
  on('workspace:changed', mode => { if (mode !== 'compare') replay.hide(); });
  on('repair:ready', repair => {
    if (sameSearchContext(repair.context, comparison)) replay.setRepair(repair);
  });
  $('visualize').addEventListener('click', replay.hide);

  $('compareBtn').onclick = async () => {
    const prepared = { graph: currentTripGraph() };
    if (!prepared.graph) Object.assign(prepared, await prepareTripRegion());
    if (!prepared.graph) {
      if (prepared.message) { invalidate(); status(prepared.message); }
      return;
    }
    const { start, end, mode } = state, closures = getClosures();
    const { s, t } = snapRouteEndpoints(base, start, end);
    if (s < 0 || t < 0) { status(connectionMessage(snapRoutePoint(base, s < 0 ? start : end).reason)); return; }
    const id = ++generation;
    comparison = undefined;
    $('compareBtn').disabled = true;
    replay.set();
    renderResults();
    status('Running comparisons…');
    try {
      await nextTask();
      if (id !== generation) return;
      const graph = getRoutingGraph();
      await prepareReverseAdjacency(graph);
      if (id !== generation) return;
      const rows = [];
      for (const [key, algo] of Object.entries(ALGORITHMS)) {
        await nextTask();
        if (id !== generation) return;
        const it = (key === 'lpa' ? lpaFresh : algo.run)(graph, s, t, mode);
        const trace = createSearchTrace();
        const result = await runInSlices(it, { keepGoing: () => id === generation, capture: trace.record });
        if (!result || id !== generation) return;
        const { value: path, count, ms } = result;
        rows.push({ key, name: algo.name, baseline: algo.baseline, path, count, ms, trace, uniqueNodes: trace.uniqueNodes(),
          directions: key === 'bidir' ? trace.directions() : undefined, ...(path && routeMetrics(graph, path)) });
      }
      const baseline = rows.find(row => row.baseline);
      const metric = mode === 'fast' ? 'time' : 'dist';
      for (const row of rows) {
        row.matches = !row.baseline && (row.path && baseline.path
          ? costsAgree(row[metric], baseline[metric])
          : !row.path && !baseline.path);
        const reachability = row.path ? 'Reachable' : 'Unreachable';
        row.verdict = row.baseline ? reachability : row.matches
          ? (row.path ? 'Cost matches' : 'Unreachable · agrees')
          : `${reachability} · differs`;
      }
      comparison = { graph: base, s, t, mode, closures };
      renderResults(rows, comparison);
      replay.set({ graph: base, start, end, closures, rows }, matchingRepair(comparison));
      const disagreement = rows.some(row => !row.baseline && !row.matches);
      const outcome = disagreement ? 'A result differs from the Dijkstra baseline.'
        : baseline.path ? 'All optimized costs agree.' : noRouteMessage(base, s, t, mode, closures.length > 0);
      status(`Comparison completed. ${outcome}`);
    } catch (error) {
      if (id === generation) {
        console.error('Algorithm comparison failed', error);
        status('Could not complete the comparison. Try running it again.');
      }
    } finally {
      if (id === generation) $('compareBtn').disabled = false;
    }
  };
  status(initialStatus);
}
