/* node --expose-gc scripts/benchmark-network.mjs DATASET [DESTINATIONS_JSON] */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ALGORITHMS } from '../js/algorithms/index.js';
import { lpaFresh, lpaRepair, lpaReset } from '../js/algorithms/lpa-star.js';
import { findChokepoints } from '../js/analysis/chokepoints.js';
import { CHOKEPOINTS, DEFAULT_START, PLACES } from '../js/config.js';
import { removeClosedRoads } from '../js/graph/closure-filter.js';
import { decodeRoadGraph, nearestNode, reverseAdjacency, routeMetrics, snapRoutePoint } from '../js/graph/road-graph.js';

const [file, coordinatesFile] = process.argv.slice(2);
if (!file) throw Error('Pass a snapshot filename');
const memory = () => { globalThis.gc?.(); return process.memoryUsage().heapUsed; };
const round = n => Math.round(n * 100) / 100;
const heap = memory();
const bytes = readFileSync(file);
const readStart = performance.now();
const json = file.endsWith('.gz') ? gunzipSync(bytes) : bytes;
let dataset = JSON.parse(json);
const parseMs = performance.now() - readStart;
const buildStart = performance.now();
const graph = decodeRoadGraph(dataset);
const buildMs = performance.now() - buildStart;
dataset = null;
const graphMiB = (memory() - heap) / 1048576;
const reverseStart = performance.now();
reverseAdjacency(graph);
const reverseMs = performance.now() - reverseStart;
const withReverseMiB = (memory() - heap) / 1048576;
const n = graph.lat.length;
let directedEdges = 0, km = 0;
for (let u = 0; u < n; u++) {
  directedEdges += graph.adj[u].length;
  for (const [v, d] of graph.adj[u]) if (u < v || !graph.adj[v].some(edge => edge[0] === u)) km += d / 1000;
}
console.log(JSON.stringify({
  file, bytes: statSync(file).size, rawBytes: json.length, gzipBytes: file.endsWith('.gz') ? bytes.length : gzipSync(json, { level: 9 }).length,
  parseMs: round(parseMs), buildMs: round(buildMs), reverseMs: round(reverseMs),
  graphMiB: round(graphMiB), withReverseMiB: round(withReverseMiB), vertices: n, directedEdges, roadKm: round(km)
}));

function run(generator) {
  const before = performance.now();
  let step, expanded = 0;
  while (!(step = generator.next()).done) expanded++;
  return { path: step.value, expanded, ms: round(performance.now() - before) };
}

const choices = coordinatesFile ? JSON.parse(readFileSync(coordinatesFile)) : {};
const destinations = { 'University of San Agustin': PLACES['University of San Agustin'], 'Iloilo Airport': PLACES['Iloilo Airport (Cabatuan)'], ...choices };
const s = snapRoutePoint(graph, PLACES[DEFAULT_START]).i;
assert.ok(s >= 0);
for (const [name, ll] of Object.entries(destinations)) {
  const before = performance.now();
  const { i: t, d } = snapRoutePoint(graph, ll);
  const snapMs = round(performance.now() - before);
  if (t < 0) { console.log(JSON.stringify({ name, snapMs, outcome: 'unsupported' })); continue; }
  for (const mode of ['short', 'fast']) {
    const records = {};
    const paths = {};
    for (const [key, algorithm] of Object.entries(ALGORITHMS)) {
      const make = () => (key === 'lpa' ? lpaFresh : algorithm.run)(graph, s, t, mode);
      const results = Array.from({length: 3}, () => run(make()));
      const ms = results.map(result => result.ms).sort((a, b) => a - b)[1];
      const { path, expanded } = results[0];
      paths[key] = path;
      if (path) {
        assert.equal(path[0], s);
        assert.equal(path.at(-1), t);
        for (let j = 1; j < path.length; j++) assert.ok(graph.adj[path[j - 1]].some(edge => edge[0] === path[j]));
      }
      const metric = mode === 'short' ? 'dist' : 'time';
      records[key] = { ms, expanded, cost: path ? routeMetrics(graph, path)[metric] : null };
    }
    const base = records.dijkstra.cost;
    for (const algorithm of Object.keys(records)) {
      const cost = records[algorithm].cost;
      if (cost === null || base === null) assert.equal(cost, base, name);
      else assert.ok(Math.abs(cost - base) <= Math.max(1e-6, base * 1e-8), `${name} ${mode} ${algorithm} cost ${cost} baseline ${base}`);
    }
    console.log(JSON.stringify({ name, mode, snapMetres: round(d), snapMs,
      km: paths.dijkstra ? round(routeMetrics(graph, paths.dijkstra).dist / 1000) : null, algorithms: records }));
  }
}

const end = snapRoutePoint(graph, PLACES['Iloilo Airport (Cabatuan)']).i;
if (end >= 0) {
  const initial = run(ALGORITHMS.lpa.run(graph, s, end, 'fast', []));
  assert.ok(initial.path, 'airport route missing');
  const middle = initial.path.length >> 1;
  const a = initial.path[middle - 1], b = initial.path[middle];
  const closed = [{ keys: new Set([a * n + b, b * n + a]) }];
  const began = performance.now();
  const updated = run(lpaRepair(closed));
  const repairMs = round(performance.now() - began);
  const fresh = run(lpaFresh(removeClosedRoads(graph, closed), s, end, 'fast'));
  assert.equal(!!updated.path, !!fresh.path);
  if (updated.path) assert.ok(Math.abs(routeMetrics(graph, updated.path).time - routeMetrics(graph, fresh.path).time) < 1e-6);
  assert.deepEqual(run(lpaRepair([])).path, initial.path);
  lpaReset();
  console.log(JSON.stringify({ lpa: { initialMs: initial.ms, expanded: initial.expanded, repairMs, repairExpanded: updated.expanded, freshMs: fresh.ms } }));
}
const demand = CHOKEPOINTS.places.map(name => ({ name, i: nearestNode(graph, PLACES[name]).i }));
const chokeStart = performance.now();
const result = await findChokepoints(graph, demand,
  { candidates: CHOKEPOINTS.candidates, topK: CHOKEPOINTS.topK, penalty: CHOKEPOINTS.disconnectPenaltySec });
console.log(JSON.stringify({ chokepointMs: round(performance.now() - chokeStart), trips: result.trips, candidates: result.examined, ranked: result.chokepoints.length }));
