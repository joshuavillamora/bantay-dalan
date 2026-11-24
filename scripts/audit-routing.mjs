/* Run from the repository root: node scripts/audit-routing.mjs */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { gunzipSync } from 'node:zlib';
import { ALGORITHMS } from '../js/algorithms/index.js';
import { heuristic } from '../js/algorithms/common.js';
import { lpaFresh, lpaRepair, lpaReset } from '../js/algorithms/lpa-star.js';
import { CHOKEPOINTS, DEFAULT_ROAD_SPEED, MAX_SPEED_MS, PLACES, ROADS_URL, SPEED } from '../js/config.js';
import { Heap } from '../js/core/heap.js';
import { blockedEdges, removeClosedRoads } from '../js/graph/closure-filter.js';
import { selectRoads } from '../js/graph/closure-selection.js';
import { decodeRoadGraph, nearestRoadVertex, reverseAdjacency, routeMetrics, snapRoutePoint } from '../js/graph/road-graph.js';
import { findChokepoints } from '../js/analysis/chokepoints.js';
import { chordDistance, hav } from '../js/utils/geo.js';

const bytes = readFileSync(new URL('../' + ROADS_URL, import.meta.url));
let dataset = JSON.parse(gunzipSync(bytes));
const graph = decodeRoadGraph(dataset);
const locations = JSON.parse(readFileSync(new URL('benchmark-destinations.json', import.meta.url)));
const demo = JSON.parse(readFileSync(new URL('presentation-fixture.json', import.meta.url)));
const warmups = 3, repeats = 9;
const algorithms = Object.entries(ALGORITHMS);
const modes = ['short', 'fast'];
const say = value => console.log(JSON.stringify(value));
const closeEnough = (value, target) => Math.abs(value - target) <= Math.max(1e-8, Math.abs(target) * 1e-12);
const weight = (mode, metres, kmh) => mode === 'short' ? metres : 3.6 * metres / kmh;
const point = (g, i) => [g.lat[i], g.lng[i]];
const snap = ll => {
  const { i } = snapRoutePoint(graph, ll);
  assert.ok(i >= 0, 'fixture failed to snap: ' + ll);
  return i;
};

say({ environment: { node: process.version, os: os.release(), arch: os.arch(), cpu: os.cpus()[0].model },
  datasetSha256: createHash('sha256').update(bytes).digest('hex'), warmups, repeats });

{
  const offsets = new Uint32Array(graph.lat.length + 1);
  for (let u = 0; u < graph.lat.length; u++) offsets[u + 1] = offsets[u] + graph.adj[u].length;
  const expected = new Uint8Array(offsets.at(-1));
  function checkDirection(u, v, speed) {
    const index = graph.adj[u].findIndex(edge => edge[0] === v);
    assert.ok(index >= 0);
    const code = offsets[u] + index;
    expected[code] = Math.max(expected[code], speed);
  }
  for (const [kind, flags, , nodes] of dataset.ways) {
    const speed = SPEED[dataset.classes[kind]] || DEFAULT_ROAD_SPEED;
    for (let i = 1; i < nodes.length; i++) {
      const u = nodes[i - 1], v = nodes[i];
      if (u === v) continue;
      if (flags & 1) checkDirection(u, v, speed);
      if (flags & 2) checkDirection(v, u, speed);
    }
  }
  const speeds = {};
  let noReverse = 0, maxDistanceDifferenceMetres = 0;
  for (let u = 0; u < graph.lat.length; u++) {
    graph.adj[u].forEach(([v, d, speed], i) => {
      assert.ok(expected[offsets[u] + i] > 0 && expected[offsets[u] + i] === speed);
      assert.ok(speed / 3.6 <= MAX_SPEED_MS);
      const ll = [...point(graph, u), ...point(graph, v)];
      assert.equal(d, Math.max(0.01, hav(...ll)));
      const spherical = 2 * 6371000 * Math.asin(chordDistance(...ll) / (2 * 6371000));
      maxDistanceDifferenceMetres = Math.max(maxDistanceDifferenceMetres, Math.abs(d - spherical));
      if (!graph.adj[v].some(edge => edge[0] === u)) noReverse++;
      speeds[speed] = (speeds[speed] || 0) + 1;
    });
  }
  say({ directedEdges: expected.length, noReverse, speeds, maxDistanceDifferenceMetres });
}
dataset = null;

function exhaust(generator, distinct) {
  let result, events = 0;
  while (!(result = generator.next()).done) {
    events++;
    distinct?.add(result.value.u);
  }
  return { path: result.value, events };
}

function timed(make) {
  const start = performance.now();
  const result = exhaust(make());
  return { ...result, ms: performance.now() - start };
}

function stats(values) {
  const v = values.slice().sort((a, b) => a - b);
  const q = fraction => {
    const index = fraction * (v.length - 1), lo = Math.floor(index);
    return v[lo] + (v[Math.ceil(index)] - v[lo]) * (index - lo);
  };
  const d = value => +value.toFixed(4);
  return { medianMs: d(q(.5)), q1Ms: d(q(.25)), q3Ms: d(q(.75)), minMs: d(v[0]), maxMs: d(v.at(-1)), samplesMs: values.map(d) };
}

// An independent relaxation and cost sum, using the shared priority queue only.
function reference(g, s, t, mode) {
  const dist = new Float64Array(g.lat.length).fill(Infinity);
  const final = new Uint8Array(g.lat.length);
  const parent = new Int32Array(g.lat.length).fill(-1);
  const queue = new Heap();
  dist[s] = 0;
  queue.push(s, 0);
  while (queue.size) {
    const u = queue.pop();
    if (final[u]) continue;
    if (u === t) {
      const path = [];
      for (let p = t; p !== -1; p = parent[p]) path.push(p);
      return { cost: dist[t], path: path.reverse() };
    }
    final[u] = 1;
    for (const [v, metres, kmh] of g.adj[u]) {
      const next = dist[u] + weight(mode, metres, kmh);
      if (next >= dist[v]) continue;
      dist[v] = next;
      parent[v] = u;
      queue.push(v, next);
    }
  }
  return { cost: null, path: null };
}

function validate(g, s, t, path, mode, expected) {
  if (expected === null) { assert.equal(path, null); return null; }
  assert.ok(path);
  assert.equal(path[0], s);
  assert.equal(path.at(-1), t);
  let metres = 0, seconds = 0;
  for (let k = 1; k < path.length; k++) {
    const pair = g.adj[path[k - 1]].filter(([v]) => v === path[k]);
    assert.equal(pair.length, 1, 'path edge must be modeled, open, and unique');
    const [, length, speed] = pair[0];
    metres += length;
    seconds += 3.6 * length / speed;
  }
  const totals = routeMetrics(g, path);
  assert.ok(closeEnough(totals.dist, metres));
  assert.ok(closeEnough(totals.time, seconds));
  const cost = mode === 'short' ? totals.dist : totals.time;
  assert.ok(closeEnough(cost, expected), `Cost ${cost} differs from ${expected}`);
  return totals;
}

const plaza = snap(PLACES['Plaza Libertad']);
const airport = snap(PLACES['Iloilo Airport (Cabatuan)']);
const campus = snap(PLACES['University of San Agustin']);
const kalibo = snap(locations['Kalibo Municipal Hall']);
const jordan = snap(locations['Jordan Public Market']);
const oneWay = [[10.7491925, 122.5310925], [10.7492695, 122.5311181]].map(snap);
const port = [[11.2161717,123.1110586], [11.2165024,123.1107538]].map(snap);
assert.deepEqual(oneWay, [30646, 30647]);
assert.deepEqual(port, [439518, 439520]);
const [a, b] = [[port[0], 439521, port[1]], [port[0], 439519, port[1]]];
const portDeltaMetres = routeMetrics(graph, b).dist - routeMetrics(graph, a).dist;
assert.ok(portDeltaMetres > 1e-8 && portDeltaMetres < .001);

const airportPath = reference(graph, plaza, airport, 'fast').path;
const middle = airportPath.length >> 1;
const u = airportPath[middle - 1], v = airportPath[middle];
const [p, q] = [point(graph, u), point(graph, v)];
const mid = p.map((coordinate, i) => (coordinate + q[i]) / 2);
const cross = [q[1] - p[1], p[0] - q[0]];
const factor = .0002 / Math.hypot(...cross);
const line = { a: mid.map((coordinate, i) => coordinate - factor * cross[i]),
  b: mid.map((coordinate, i) => coordinate + factor * cross[i]) };
const keys = blockedEdges(graph, [line]);
assert.ok(keys.has(u * graph.lat.length + v));
const reroute = [{ keys }];
const isolate = [{ keys: new Set(graph.adj[plaza].map(([to]) => plaza * graph.lat.length + to)) }];
const closedAirport = removeClosedRoads(graph, reroute);
const closedUrban = removeClosedRoads(graph, isolate);
assert.notEqual(reference(closedAirport, plaza, airport, 'fast').cost, reference(graph, plaza, airport, 'fast').cost);
assert.ok(reference(closedAirport, plaza, airport, 'fast').path);

const demoStart = snap(PLACES[demo.start]), demoGoal = snap(PLACES[demo.end]);
const [demoFrom, demoTo] = demo.edge, demoSize = graph.lat.length;
const degreesPerPixel = 360 / (256 * 2 ** demo.zoom);
const demoSelection = exhaust(selectRoads(graph, demo.line, {
  pixel: [degreesPerPixel * Math.cos(demo.center[0] * Math.PI / 180), degreesPerPixel]
})).path;
assert.deepEqual([...demoSelection.keys], [demoFrom * demoSize + demoTo]);
assert.equal(graph.ways[graph.adj[demoFrom].find(edge => edge[0] === demoTo)[3]], demo.road);
const demoClosures = [demoSelection], closedDemo = removeClosedRoads(graph, demoClosures);
const demoOpenPath = reference(graph, demoStart, demoGoal, demo.mode).path;
assert.ok(demoOpenPath.some((node, i) => node === demoFrom && demoOpenPath[i + 1] === demoTo));
say({ presentation: demo, start: PLACES[demo.start], end: PLACES[demo.end], demoStart, demoGoal,
  selectedSegments: demoSelection.segments.size, closedDirections: demoSelection.keys.size });

const t = 1 / 1024;
const exact = { lat: [10, 10 + t, 10 + t, 10 + 2 * t], lng: [122, 122 - t, 122 + t, 122], adj: [] };
exact.adj = [[1, 2], [3], [3], []].map((list, start) =>
  list.map(end => [end, hav(...point(exact, start), ...point(exact, end)), 25]));
assert.notDeepEqual([0, 1, 3], [0, 2, 3]);
assert.deepEqual(routeMetrics(exact, [0, 1, 3]), routeMetrics(exact, [0, 2, 3]));
say({ fixtures: { oppositeDirectionRoad: 'Costa Tropical Street', portDeltaMetres, airportClosure: { u, v, line, directedEdges: keys.size } } });

for (const goal of [plaza, kalibo, snap(locations['San Joaquin Church'])]) {
  const estimate = heuristic(graph, goal, 'short');
  const h = graph.lat.map((_, node) => estimate(node));
  const old = graph.lat.map((lat, node) => hav(lat, graph.lng[node], graph.lat[goal], graph.lng[goal]));
  let maxResidual = 0, oldInconsistent = 0, oldMaxResidual = 0;
  for (let u = 0; u < graph.adj.length; u++) for (const [v, d] of graph.adj[u]) {
    maxResidual = Math.max(maxResidual, h[u] - h[v] - d);
    const residual = old[u] - old[v] - d;
    if (residual > 1e-7) oldInconsistent++;
    oldMaxResidual = Math.max(oldMaxResidual, residual);
  }
  assert.ok(maxResidual < 1e-7);
  say({ heuristicGoal: goal, maxResidual, oldInconsistent, oldMaxResidual });
}

const cases = [
  ['Presentation open', graph, demoStart, demoGoal], ['Presentation closure', closedDemo, demoStart, demoGoal],
  ['Urban campus', graph, plaza, campus], ['Airport open', graph, plaza, airport],
  ['Kalibo', graph, plaza, kalibo], ['One-way forward', graph, ...oneWay],
  ['One-way reverse', graph, oneWay[1], oneWay[0]], ['Guimaras disconnected', graph, plaza, jordan],
  ['Airport drawn closure', closedAirport, plaza, airport], ['All departures closed', closedUrban, plaza, campus],
  ['Fishing Port near tie', graph, ...port], ['Exact tied alternatives', exact, 0, 3],
  ['Same vertex', graph, plaza, plaza]
];
for (const [label, g, s, t] of cases) {
  reverseAdjacency(g);
  for (const mode of modes) {
    const expected = reference(g, s, t, mode).cost;
    const records = Object.fromEntries(algorithms.map(([key]) => [key, { samples: [] }]));
    for (let pass = 0; pass < warmups + repeats; pass++) {
      for (let i = 0; i < algorithms.length; i++) {
        const [key, algo] = algorithms[(i + pass) % algorithms.length];
        const run = () => (key === 'lpa' ? lpaFresh : algo.run)(g, s, t, mode);
        const result = timed(run);
        const totals = validate(g, s, t, result.path, mode, expected);
        const row = records[key];
        if (pass === 0) {
          const seen = new Set();
          const instrumented = exhaust(run(), seen);
          assert.equal(instrumented.events, result.events);
          row.events = result.events;
          row.unique = seen.size;
          row.totals = totals;
        }
        assert.equal(row.events, result.events);
        if (pass >= warmups) row.samples.push(result.ms);
      }
    }
    for (const row of Object.values(records)) {
      Object.assign(row, stats(row.samples));
      delete row.samples;
    }
    say({ trip: label, s, t, mode, referenceCost: expected, algorithms: records });
  }
}

const repairCases = [
  ['Airport open → closed → reopened', plaza, airport, closedAirport, reroute],
  ['Presentation open → closed → reopened', demoStart, demoGoal, closedDemo, demoClosures]
];
for (const [label, start, goal, closedGraph, closures] of repairCases) for (const mode of modes) {
  const open = reference(graph, start, goal, mode).cost;
  const closed = reference(closedGraph, start, goal, mode).cost;
  const records = Object.fromEntries(['initial', 'close', 'reopen', 'freshClosed', 'freshReopened'].map(key => [key, { samples: [] }]));
  function measure(pass, operation, g, expectation, make) {
    const result = timed(make);
    const totals = validate(g, start, goal, result.path, mode, expectation);
    const row = records[operation];
    if (pass === 0) Object.assign(row, { events: result.events, totals });
    assert.equal(row.events, result.events);
    if (pass >= warmups) row.samples.push(result.ms);
  }
  for (let pass = 0; pass < warmups + repeats; pass++) {
    lpaReset();
    measure(pass, 'initial', graph, open, () => ALGORITHMS.lpa.run(graph, start, goal, mode, []));
    measure(pass, 'close', closedGraph, closed, () => lpaRepair(closures));
    measure(pass, 'reopen', graph, open, () => lpaRepair([]));
    measure(pass, 'freshClosed', closedGraph, closed, () => lpaFresh(closedGraph, start, goal, mode));
    measure(pass, 'freshReopened', graph, open, () => lpaFresh(graph, start, goal, mode));
  }
  lpaReset();
  for (const row of Object.values(records)) {
    Object.assign(row, stats(row.samples));
    delete row.samples;
  }
  say({ lpaRepair: label, mode, open, closed, operations: records });
}

const demand = CHOKEPOINTS.places.map(name => ({ name, i: nearestRoadVertex(graph, PLACES[name]).i }));
const begin = performance.now();
const analysis = await findChokepoints(graph, demand, {
  candidates: CHOKEPOINTS.candidates, topK: CHOKEPOINTS.topK, penalty: CHOKEPOINTS.disconnectPenaltySec
});
const { name, key, used, total, rerouted, cut, avgExtra, score, coords } = analysis.chokepoints[0];
say({ criticalRoad: { name, key, used, total, rerouted, cut, avgExtra, score, coords,
  totalExtraSeconds: rerouted * avgExtra, candidates: analysis.examined, elapsedMs: performance.now() - begin } });
