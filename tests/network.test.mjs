import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALGORITHMS } from '../js/algorithms/index.js';
import { lpaFresh, lpaInfo, lpaReady, lpaRepair, lpaReset } from '../js/algorithms/lpa-star.js';
import { findChokepoints } from '../js/analysis/chokepoints.js';
import { CHOKEPOINTS, DEFAULT_START, DEFAULT_END, PLACES } from '../js/config.js';
import { blockedEdges, removeClosedRoads } from '../js/graph/closure-filter.js';
import { buildGraph, loadGraph, nearestNode, routeMetrics, snapRouteEndpoints } from '../js/graph/road-graph.js';

const data = JSON.parse(readFileSync(new URL('../data/iloilo-roads.json', import.meta.url)));
const graph = buildGraph(data.elements);
const endpoints = snapRouteEndpoints(graph, PLACES[DEFAULT_START], PLACES[DEFAULT_END]);

function finish(search) {
  let result = search.next();
  while (!result.done) result = search.next();
  return result.value;
}

function assertOptimal(g, s, t, mode, path, baseline) {
  assert.equal(!!path, !!baseline);
  if (!path) return;
  assert.equal(path[0], s);
  assert.equal(path.at(-1), t);
  for (let i = 1; i < path.length; i++) {
    assert.ok(g.adj[path[i - 1]].some(edge => edge[0] === path[i]), 'path uses only open directed edges');
  }
  const metric = mode === 'short' ? 'dist' : 'time';
  assert.ok(Math.abs(routeMetrics(g, path)[metric] - routeMetrics(g, baseline)[metric]) < 1e-6);
}

function verifySearches(g, s, t, mode) {
  const baseline = finish(ALGORITHMS.dijkstra.run(g, s, t, mode));
  for (const [key, algo] of Object.entries(ALGORITHMS)) {
    if (algo.baseline) continue;
    const path = finish((key === 'lpa' ? lpaFresh : algo.run)(g, s, t, mode));
    assertOptimal(g, s, t, mode, path, baseline);
  }
  return baseline;
}

test('the graph loader retries after a failed road-data request and caches a successful load', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return requests === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => data };
  });
  await assert.rejects(loadGraph(), /503/);
  const loaded = await loadGraph();
  assert.equal(loaded.lat.length, graph.lat.length);
  assert.equal(await loadGraph(), loaded);
  assert.equal(requests, 2);
});

test('each endpoint must snap independently to a nearby base-graph node', () => {
  assert.ok(endpoints.s >= 0 && endpoints.t >= 0);
  assert.deepEqual(snapRouteEndpoints(graph, PLACES[DEFAULT_START], [0, 0]), { s: endpoints.s, t: -1 });
  assert.deepEqual(snapRouteEndpoints(graph, [0, 0], PLACES[DEFAULT_END]), { s: -1, t: endpoints.t });
});

test('the three primary searches match Dijkstra in both modes and directions', () => {
  assert.deepEqual(Object.keys(ALGORITHMS), ['bidir', 'astar', 'lpa', 'dijkstra']);
  for (const mode of ['short', 'fast']) {
    const { s, t } = endpoints;
    assert.ok(verifySearches(graph, s, t, mode));
    assert.ok(verifySearches(graph, t, s, mode));
    assert.deepEqual(verifySearches(graph, s, s, mode), [s]);
  }
});

test('a sampled closure line blocks real edges, and LPA* repairs through multiple closures and reopenings', () => {
  const { s, t } = endpoints, mode = 'fast', n = graph.lat.length;
  const original = finish(ALGORITHMS.lpa.run(graph, s, t, mode, []));
  assert.ok(lpaReady());
  const originalState = lpaInfo();
  finish(lpaFresh(graph, t, s, 'short'));
  assert.deepEqual(lpaInfo(), originalState, 'fresh comparison must preserve the interactive LPA* search');

  const index = Math.floor(original.length / 2);
  const u = original[index - 1], v = original[index];
  const lat = (graph.lat[u] + graph.lat[v]) / 2, lng = (graph.lng[u] + graph.lng[v]) / 2;
  const dLat = (graph.lat[v] - graph.lat[u]) * 1.1, dLng = (graph.lng[v] - graph.lng[u]) * 1.1;
  const keys = blockedEdges(graph, [{ a: [lat - dLng, lng + dLat], b: [lat + dLng, lng - dLat] }]);
  assert.ok(keys.has(u * n + v));
  assert.equal(blockedEdges(graph, [{ a: [0, 0], b: [.01, .01] }]).size, 0);

  const line = { keys };
  const isolateStart = { keys: new Set(graph.adj[s].map(edge => s * n + edge[0])) };
  const outside = graph.adj.findIndex((edges, i) => edges.length && !original.includes(i));
  const offRoute = { keys: new Set([outside * n + graph.adj[outside][0][0]]) };
  for (const closures of [[offRoute], [line], [line, isolateStart], [isolateStart], []]) {
    const filtered = removeClosedRoads(graph, closures);
    const repaired = finish(lpaRepair(closures));
    const baseline = verifySearches(filtered, s, t, mode);
    assertOptimal(filtered, s, t, mode, repaired, baseline);
    if (closures.includes(isolateStart)) assert.equal(repaired, null);
    if (closures.includes(line)) assert.ok(!filtered.adj[u].some(edge => edge[0] === v));
    if (!closures.length || closures[0] === offRoute) assert.deepEqual(baseline, original);
  }
  lpaReset();
  assert.equal(lpaReady(), false);
});

test('CHOKEPOINT ranks valid links by the configured impact formula and can be cancelled safely', async () => {
  const demand = CHOKEPOINTS.places.map(name => ({ name, i: nearestNode(graph, PLACES[name]).i }));
  const { candidates, topK, disconnectPenaltySec: penalty } = CHOKEPOINTS;
  const before = graph.adj.slice();
  const progress = [];
  const { chokepoints, examined, trips } = await findChokepoints(graph, demand, {
    candidates, topK, penalty,
    onProgress: (stage, done, total) => progress.push([stage, done, total])
  });
  assert.ok(examined <= candidates && examined >= chokepoints.length);
  assert.equal(trips, 36);
  assert.equal(chokepoints.length, topK);
  assert.ok(progress.every(([, done, total]) => done <= total));
  chokepoints.forEach((result, i) => {
    const { nodes, avgExtra, rerouted, cut, score } = result;
    if (i) assert.ok(chokepoints[i - 1].score >= score);
    assert.ok(Math.abs(score - (avgExtra * rerouted + penalty * cut)) < 1e-6);
    for (let k = 1; k < nodes.length; k++) {
      const a = nodes[k - 1], b = nodes[k];
      assert.ok(graph.adj[a].some(e => e[0] === b) || graph.adj[b].some(e => e[0] === a));
    }
  });

  const controller = new AbortController();
  await assert.rejects(findChokepoints(graph, demand, {
    signal: controller.signal,
    onProgress: stage => { if (stage === 'Testing closures') controller.abort(); }
  }), { name: 'AbortError' });
  graph.adj.forEach((edges, i) => assert.equal(edges, before[i]));
});
