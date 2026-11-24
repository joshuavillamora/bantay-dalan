/* Validate one prepared routing dataset and print a manifest candidate and measurements. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { ALGORITHMS } from '../js/algorithms/index.js';
import { lpaFresh, lpaRepair, lpaReset } from '../js/algorithms/lpa-star.js';
import { findChokepoints } from '../js/analysis/chokepoints.js';
import { removeClosedRoads } from '../js/graph/closure-filter.js';
import { selectRoads } from '../js/graph/closure-selection.js';
import { decodeRoadGraph, reverseAdjacency, routeMetrics, snapRoutePoint } from '../js/graph/road-graph.js';
import { roadSpatialIndex } from '../js/graph/road-spatial.js';
import { finishWork } from '../js/utils/work-slices.js';

const [path, fixturesPath] = process.argv.slice(2);
const id = basename(path, '.json.gz');
const fixture = JSON.parse(readFileSync(fixturesPath, 'utf8'))[id];
const raw = readFileSync(path);
const timings = {};
function measure(label, operation) {
  const start = performance.now();
  try { return operation(); }
  finally { timings[label] = +(performance.now() - start).toFixed(2); }
}
const MiB = 1024 ** 2;
global.gc?.();
const baselineHeap = process.memoryUsage().heapUsed;
function prepare() {
  const data = measure('parse', () => JSON.parse(gunzipSync(raw)));
  assert.equal(data.scope, id);
  assert.equal(data.nodeIds.length * 2, data.coordinates.length);
  assert.equal(data.wayIds.length, data.ways.length);
  assert.equal(new Set(data.nodeIds).size, data.nodeIds.length);
  assert.ok(data.nodeIds.every(id => Number.isSafeInteger(id) && id > 0));
  assert.ok(data.wayIds.every(id => Number.isSafeInteger(id) && id > 0));
  const graph = measure('build', () => decodeRoadGraph(data));
  const { bounds } = measure('spatial', () => roadSpatialIndex(graph));
  return { graph, bounds, source: data.pbfSha256, version: data.replicationTimestamp ?? fixture.version };
}
const { graph, bounds, source, version } = prepare();
global.gc?.();
const heapMiB = +((process.memoryUsage().heapUsed - baselineHeap) / MiB).toFixed(1);
const manifest = { id, name: fixture.name, url: `data/regions/${id}.json.gz`,
  scope: id, version, source, bounds, vertices: graph.lat.length, edges: graph.edgeCount,
  bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') };
if (manifest.vertices > 575000 || manifest.bytes > 8 * MiB || heapMiB > 155) {
  console.log(JSON.stringify({ manifest, heapMiB, timings, deferred: 'exceeds browser candidate budget' }));
  process.exit();
}

const { lat, lng, adj } = graph, n = lat.length;
reverseAdjacency(graph);
const nearest = point => {
  const { i, d } = snapRoutePoint(graph, point);
  assert.ok(i >= 0, `${id}: no suitable road near ${point}`);
  return { i, offset: +d.toFixed(1), point: [lat[i], lng[i]] };
};
const [start, short, long] = [fixture.start, fixture.short, fixture.long].map(nearest);
const repaired = {}, verified = [];
function metrics(g, route, s, t, mode, closed) {
  assert.equal(route[0], s);
  assert.equal(route.at(-1), t);
  return routeMetrics(g, route, closed)[mode === 'fast' ? 'time' : 'dist'];
}
const equal = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-12),
  `Optimized cost differs: ${actual} / ${expected}`);
function audit(label, g, s, t, mode, expected = true) {
  assert.notEqual(s, t);
  reverseAdjacency(g);
  const times = {};
  const run = (key, it) => measure(`${label}:${mode}:${key}`, () => finishWork(it(g, s, t, mode)));
  const path = run('dijkstra', ALGORITHMS.dijkstra.run);
  assert.equal(Boolean(path), expected, `${id}: unexpected reachability on ${label}`);
  const cost = path && metrics(g, path, s, t, mode);
  for (const [key, algo] of Object.entries(ALGORITHMS)) {
    if (algo.baseline) continue;
    const other = run(key, key === 'lpa' ? lpaFresh : algo.run);
    assert.equal(Boolean(other), expected);
    if (other) equal(metrics(g, other, s, t, mode), cost);
  }
  for (const key of Object.keys(ALGORITHMS)) times[key] = timings[`${label}:${mode}:${key}`];
  verified.push({ label, mode, totals: path && routeMetrics(g, path), ms: times });
  return path;
}

const links = { start, short, long };
if (fixture.bridge) links.bridge = nearest(fixture.bridge);
if (fixture.disconnected) links.disconnected = nearest(fixture.disconnected);
if (fixture.islandDestination) links.islandDestination = nearest(fixture.islandDestination);
if (fixture.viaCapiz) links.viaCapiz = nearest(fixture.viaCapiz);
if (fixture.viaAntique) links.viaAntique = nearest(fixture.viaAntique);
let shortPath;
for (const mode of ['fast', 'short']) {
  shortPath = audit('short', graph, start.i, short.i, mode);
  audit('long', graph, start.i, long.i, mode);
  if (links.viaCapiz) audit('Iloilo–Capiz', graph, start.i, links.viaCapiz.i, mode);
  if (links.viaAntique) audit('Iloilo–Antique', graph, start.i, links.viaAntique.i, mode);
  if (links.bridge) audit('bridge approach', graph, start.i, links.bridge.i, mode);
  if (links.disconnected) audit('unbridged island', graph, start.i, links.disconnected.i, mode, false);
  if (links.islandDestination) audit('within unbridged island', graph, links.disconnected.i, links.islandDestination.i, mode);
  const i = Math.max(1, Math.floor(shortPath.length / 2));
  const a = shortPath[i - 1], b = shortPath[i];
  const keys = new Set([a * n + b]);
  if (adj[b].some(edge => edge[0] === a)) keys.add(b * n + a);
  const [ay, ax, by, bx] = [lat[a], lng[a], lat[b], lng[b]];
  const y = (ay + by) / 2, x = (ax + bx) / 2;
  const length = Math.hypot(bx - ax, by - ay), dy = (bx - ax) / length * .00002, dx = (ay - by) / length * .00002;
  if (length) {
    const selection = measure('selectClosure', () => finishWork(selectRoads(graph, [[y - dy, x - dx], [y + dy, x + dx]])));
    assert.ok(selection.keys.has(a * n + b), 'Closure line should select the edge traversed by the route');
  }
  const closures = [{ keys }];
  const closedGraph = removeClosedRoads(graph, closures);
  assert.ok(!closedGraph.adj[a].some(edge => edge[0] === b));
  const detour = finishWork(ALGORITHMS.dijkstra.run(closedGraph, start.i, short.i, mode));
  audit('closed link', closedGraph, start.i, short.i, mode, Boolean(detour));
  finishWork(ALGORITHMS.lpa.run(graph, start.i, short.i, mode, []));
  const repair = measure('repair-close:' + mode, () => finishWork(lpaRepair(closures)));
  assert.equal(Boolean(repair), Boolean(detour));
  if (repair) equal(metrics(graph, repair, start.i, short.i, mode, keys), metrics(closedGraph, detour, start.i, short.i, mode));
  const reopen = measure('repair-open:' + mode, () => finishWork(lpaRepair([])));
  equal(metrics(graph, reopen, start.i, short.i, mode), metrics(graph, shortPath, start.i, short.i, mode));
  lpaReset();
  const sealed = removeClosedRoads(graph, [{ keys: new Set(adj[start.i].map(([v]) => start.i * n + v)) }]);
  audit('closed departures', sealed, start.i, short.i, mode, false);
  repaired[mode] = { closeMs: timings['repair-close:' + mode], reopenMs: timings['repair-open:' + mode], reachable: Boolean(repair) };
}
let oneWay;
const oneWayFrom = u => adj[u].find(([v]) => !adj[v].some(([to]) => to === u));
const oneWayOrigin = shortPath.find(u => oneWayFrom(u)) ?? adj.findIndex((_, u) => oneWayFrom(u));
if (oneWayOrigin >= 0) {
  const u = oneWayOrigin, [v] = oneWayFrom(u);
  const reverse = finishWork(ALGORITHMS.dijkstra.run(graph, v, u, 'short'));
  audit('one-way reverse attempt', graph, v, u, 'short', Boolean(reverse));
  assert.ok(!reverse || reverse.length > 2);
  oneWay = { u, v, reverseReachable: Boolean(reverse) };
}

// Four reproducible road vertices from the first 3 km of the shortest urban test trip.
const prefix = [shortPath[0]];
let distance = 0;
for (let i = 1; i < shortPath.length; i++) {
  const u = shortPath[i - 1], v = shortPath[i];
  distance += adj[u].find(([to]) => to === v)[1];
  if (distance > 3000 && prefix.length >= 4) break;
  prefix.push(v);
}
assert.ok(prefix.length >= 4);
const demand = [0, 1, 2, 3].map(i => prefix[Math.floor(i * (prefix.length - 1) / 3)]);
const analysisStart = performance.now();
const analysis = await findChokepoints(graph, demand.map((i, index) => ({ i, name: 'Sample ' + (index + 1) })));
assert.equal(analysis.trips, 6);
assert.ok(analysis.examined > 0);
timings.analysis = +(performance.now() - analysisStart).toFixed(2);
console.log(JSON.stringify({ manifest: { ...manifest, demand }, heapMiB, timings, links, verified, repaired, oneWay,
  analysis: { trips: analysis.trips, candidates: analysis.examined, ranked: analysis.chokepoints.length } }));
