/* Fresh runs share a graph snapshot and leave interactive LPA* state alone. */
import { ALGORITHMS } from '../algorithms/index.js';
import { lpaFresh } from '../algorithms/lpa-star.js';
import { reverseAdjacency, routeMetrics, snapRouteEndpoints } from '../graph/road-graph.js';
import { removeClosedRoads } from '../graph/closure-filter.js';
import { state } from '../state.js';
import { on } from '../events.js';
import { $ } from '../utils/dom.js';
import { fmtClosureCount } from '../utils/format.js';
import { renderResults } from '../ui/results-table.js';
import { costName } from '../ui/dashboard.js';
import { getClosures } from './closures.js';

const initialStatus = 'Run a comparison to check route costs and expanded vertices against Dijkstra.';
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

export function initComparison() {
  let base, generation = 0;
  const status = text => { $('comparisonStatus').textContent = text; };
  function invalidate() {
    generation++;
    if (!$('resBox').hidden || $('compareBtn').disabled && base) {
      status('Trip or closures changed. Run a new comparison.');
    }
    renderResults();
    $('compareBtn').disabled = !base;
  }

  on('graph:ready', graph => { base = graph; $('compareBtn').disabled = false; });
  on('route:changed', invalidate);
  on('closures:changed', invalidate);
  on('settings:changed', setting => { if (setting === 'cost') invalidate(); });

  $('compareBtn').onclick = async () => {
    const { start, end, mode } = state, closures = getClosures();
    const { s, t } = snapRouteEndpoints(base, start, end);
    if (s < 0 || t < 0) { status('Choose a start and destination within 1.5 km of the modeled roads.'); return; }
    const id = ++generation;
    $('compareBtn').disabled = true;
    renderResults();
    status('Running fresh searches…');
    try {
      await nextTask();
      if (id !== generation) return;
      const graph = removeClosedRoads(base, closures);
      reverseAdjacency(graph);
      const rows = [];
      for (const [key, algo] of Object.entries(ALGORITHMS)) {
        await nextTask();
        if (id !== generation) return;
        const begin = performance.now();
        const it = (key === 'lpa' ? lpaFresh : algo.run)(graph, s, t, mode);
        let result = it.next(), count = 0;
        while (!result.done) { count++; result = it.next(); }
        const ms = performance.now() - begin;
        const path = result.value;
        rows.push({ name: algo.name, baseline: algo.baseline, path, count, ms, ...(path && routeMetrics(graph, path)) });
      }
      const baseline = rows.find(row => row.baseline);
      const metric = mode === 'fast' ? 'time' : 'dist';
      for (const row of rows) {
        row.matches = !row.baseline && (row.path && baseline.path
          ? Math.abs(row[metric] - baseline[metric]) <= Math.max(1e-6, Math.abs(baseline[metric]) * 1e-8)
          : !row.path && !baseline.path);
        const reachability = row.path ? 'Reachable' : 'Unreachable';
        row.verdict = row.baseline ? reachability : row.matches
          ? (row.path ? 'Cost matches' : 'Unreachable · agrees')
          : `${reachability} · differs`;
      }
      renderResults(rows);
      status(`${costName(mode)} · ${fmtClosureCount(closures.length)}. ${baseline.path ? 'Optimal cost checked against Dijkstra.' : 'Dijkstra found no path.'}`);
    } catch {
      if (id === generation) status('Could not complete the comparison. Try running it again.');
    } finally {
      if (id === generation) $('compareBtn').disabled = false;
    }
  };
  status(initialStatus);
}
