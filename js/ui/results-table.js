import { $ } from '../utils/dom.js';
import { esc, fmtClosureCount, fmtRouteDistance, fmtRouteTime } from '../utils/format.js';
import { costName } from './dashboard.js';
import { ALGORITHMS, searchSwatch } from '../algorithms/index.js';
import { sameSearchContext } from '../features/search-trace.js';

const fmtMs = ms => ms < .01 ? '<0.01 ms' : `${ms.toFixed(2)} ms`;
const searchTotals = ({ count, uniqueNodes }) => `${count.toLocaleString()} search events · ${uniqueNodes.toLocaleString()} unique nodes explored`;
export const costsAgree = (actual, reference) => Math.abs(actual - reference) <= Math.max(1e-6, Math.abs(reference) * 1e-8);

const names = Object.fromEntries(Object.entries(ALGORITHMS).map(([key, algo]) => [key, algo.name]));
let benchmark, repair;

export function renderResults(rows = [], context) {
  benchmark = context && { rows, context };
  $('comparisonContext').textContent = context
    ? `${costName(context.mode)} · ${context.closures.length} ${context.closures.length === 1 ? 'closure' : 'closures'}` : '';
  const allReachable = rows.length > 0 && rows.every(row => row.path);
  const allAgree = allReachable && rows.every(row => row.baseline || row.matches);
  // Cost agreement checks the chosen objective. Shared totals require both measurements to agree.
  const reference = rows[0];
  const sharedTotals = allReachable && rows.every(row =>
    sameTotal(row.dist, reference.dist) && sameTotal(row.time, reference.time));
  $('sharedTotals').hidden = !sharedTotals;
  $('sharedDistance').textContent = sharedTotals ? fmtRouteDistance(rows[0].dist) : '';
  $('sharedTime').textContent = sharedTotals ? fmtRouteTime(rows[0].time) : '';
  $('comparisonStatus').classList.toggle('comparison-success', allAgree);
  $('resBox').hidden = !rows.length;
  $('benchmarkMethod').hidden = !rows.length;
  $('res').innerHTML = rows.length ? `<table>
    <thead><tr><th scope="col">Algorithm</th><th scope="col" class="num">Search events</th>
      <th scope="col" class="num" aria-describedby="uniqueNodesHelp" title="${esc($('uniqueNodesHelp').textContent)}">Unique Nodes Explored</th>
      <th scope="col" class="num">Compute time</th>${sharedTotals ? '' : '<th scope="col" class="num">Route totals</th>'}</tr></thead>
    <tbody>${rows.map(row => `<tr>
      <th scope="row"><i class="algorithm-swatch" style="background:${searchSwatch(ALGORITHMS[row.key])}" aria-hidden="true"></i><abbr title="${esc(names[row.key])}">${names[row.key]}</abbr>${row.baseline ? '<small>Baseline</small>' : row.key === 'lpa' ? '<small>Fresh search</small>' : ''}
      ${allAgree ? '' : `<small class="${row.matches ? 'verified' : ''}">${row.verdict}</small>`}</th>
      <td class="num">${row.count.toLocaleString()}${row.directions ? `<small>Forward ${row.directions.forward.toLocaleString()}</small><small>Backward ${row.directions.backward.toLocaleString()}</small>` : ''}</td>
      <td class="num">${row.uniqueNodes.toLocaleString()}</td><td class="num">${esc(fmtMs(row.ms))}</td>
      ${sharedTotals ? '' : `<td class="num">${row.path ? fmtRouteDistance(row.dist) : '—'}${row.path ? `<small>${fmtRouteTime(row.time)} est.</small>` : ''}</td>`}
    </tr>`).join('')}</tbody>
  </table>` : '';
  renderEffort(allAgree ? rows : []);
  const baseline = rows.find(row => row.baseline);
  const relative = $('comparisonDeltas');
  relative.hidden = !allAgree || !baseline?.count;
  $('comparisonDeltaList').replaceChildren(...(relative.hidden ? [] : rows.filter(row => !row.baseline).map(row => {
    const difference = (row.count - baseline.count) / baseline.count * 100;
    const item = document.createElement('li');
    const delta = difference === 0 ? 'same event count' : `${Math.abs(difference).toFixed(1)}% ${difference < 0 ? 'fewer' : 'more'} events`;
    const swatch = document.createElement('i');
    swatch.className = 'algorithm-swatch';
    swatch.style.background = searchSwatch(ALGORITHMS[row.key]);
    item.append(swatch, `${names[row.key]} · ${delta}`);
    return item;
  })));
  updateRepairComparison();
}

function sameTotal(actual, reference) {
  return Math.abs(actual - reference) <= Math.max(1e-8, Math.abs(reference) * 1e-12);
}

function renderEffort(rows) {
  const effort = $('comparisonEffort');
  effort.replaceChildren();
  if (!rows.length) return;
  const measures = [
    ['Fewest search events', row => row.count],
    // Treat measurements that round to the same displayed precision as ties.
    ['Lowest compute time', row => Math.round(row.ms * 100)]
  ];
  for (const [label, measure] of measures) {
    const best = Math.min(...rows.map(measure));
    const line = document.createElement('span');
    const title = document.createElement('span');
    const result = document.createElement('strong');
    title.textContent = label;
    result.textContent = rows.filter(row => measure(row) === best).map(row => names[row.key]).join(', ');
    line.append(title, result);
    effort.append(line);
  }
}

export function renderInitialLpa(run) {
  const result = $('initialLpaResult');
  result.hidden = !run;
  result.textContent = run ? `LPA* initial search · ${searchTotals(run)}` : '';
}

export function renderRepair(run) {
  repair = run;
  $('repairBox').hidden = !run;
  $('repairResult').textContent = run
    ? `${searchTotals(run)} · ${fmtMs(run.ms)} compute · ${run.path ? 'Route available' : 'Unreachable'} · ${fmtClosureCount(run.context.closures.length)}. Reused search state for the same trip.`
    : '';
  updateRepairComparison();
}

export const matchingRepair = context => sameSearchContext(repair?.context, context) ? repair : undefined;

function updateRepairComparison() {
  const detail = $('repairComparison');
  detail.hidden = true;
  if (!matchingRepair(benchmark?.context)) return;
  const fresh = benchmark.rows.find(row => row.key === 'lpa');
  const baseline = benchmark.rows.find(row => row.baseline);
  const metric = repair.context.mode === 'fast' ? 'time' : 'dist';
  const verified = !!repair.path === !!baseline.path && (!repair.path || costsAgree(repair[metric], baseline[metric]));
  const difference = fresh.count ? (fresh.count - repair.count) / fresh.count * 100 : null;
  const change = repair.count === fresh.count ? 'Same event count in repair'
    : difference === null ? 'Percentage unavailable for a zero-event full recalculation'
    : `${Math.abs(difference).toFixed(1)}% ${difference > 0 ? 'fewer' : 'more'} events in repair`;
  const verdict = verified && fresh.matches ? (baseline.path ? 'Both costs match Dijkstra' : 'All agree the trip is unreachable')
    : 'A result differs from Dijkstra';
  detail.textContent = `Full recalculation · ${searchTotals(fresh)}. ${change}. ${verdict}.`;
  detail.hidden = false;
}
