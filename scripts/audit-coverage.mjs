/* Usage: node scripts/audit-coverage.mjs [DPWH GeoJSON in EPSG:4326] [DATASET] */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { DEFAULT_START, PLACES, ROADS_URL } from '../js/config.js';
import { decodeRoadGraph, reverseAdjacency, snapRoutePoint } from '../js/graph/road-graph.js';
import { hav } from '../js/utils/geo.js';

const file = process.argv[3] || new URL('../' + ROADS_URL, import.meta.url);
const bytes = readFileSync(file);
const snapshot = JSON.parse(String(file).endsWith('.gz') ? gunzipSync(bytes) : bytes);
const graph = decodeRoadGraph(snapshot);
const reverse = reverseAdjacency(graph);
if (snapshot.nodeIds) {
  assert.equal(snapshot.nodeIds.length, graph.lat.length);
  assert.equal(new Set(snapshot.nodeIds).size, graph.lat.length);
}
assert.equal(reverse.vertices.length, graph.edgeCount);
for (let u = 0; u < graph.lat.length; u++) {
  const targets = new Set();
  for (const [v, distance, speed] of graph.adj[u]) {
    assert.ok(Number.isInteger(v) && v >= 0 && v < graph.lat.length && !targets.has(v));
    assert.equal(distance, Math.max(.01, hav(graph.lat[u], graph.lng[u], graph.lat[v], graph.lng[v])));
    assert.ok(Number.isFinite(speed) && speed > 0);
    targets.add(v);
  }
  for (let edge = reverse.offsets[u]; edge < reverse.offsets[u + 1]; edge++) {
    assert.equal(graph.adj[reverse.vertices[edge]][reverse.indices[edge]][0], u);
  }
}
const vertices = graph.lat.map((_, i) => i);
const forward = i => graph.adj[i].map(([v]) => v);
const incoming = i => reverse.vertices.subarray(reverse.offsets[i], reverse.offsets[i + 1]);
const usable = vertices.filter(i => graph.adj[i].length || reverse.offsets[i + 1] > reverse.offsets[i]);

function components(order, ...adjacencies) {
  const label = new Int32Array(vertices.length).fill(-1);
  const sizes = [];
  for (const root of order) {
    if (label[root] >= 0) continue;
    const id = sizes.length;
    const queue = [root];
    label[root] = id;
    for (let i = 0; i < queue.length; i++) {
      for (const adj of adjacencies) {
        for (const next of adj(queue[i])) {
          if (label[next] >= 0) continue;
          label[next] = id;
          queue.push(next);
        }
      }
    }
    sizes.push(queue.length);
  }
  return { label, sizes };
}

const finished = [];
const visited = new Uint8Array(vertices.length);
for (const root of vertices) {
  if (visited[root]) continue;
  const stack = [root];
  while (stack.length) {
    const i = stack.pop();
    if (i < 0) finished.push(~i);
    else if (!visited[i]) {
      visited[i] = 1;
      stack.push(~i);
      for (const [next] of graph.adj[i]) if (!visited[next]) stack.push(next);
    }
  }
}

const weak = components(vertices, forward, incoming);
const strong = components(finished.reverse(), incoming);
const start = snapRoutePoint(graph, PLACES[DEFAULT_START]).i;
const plazaComponent = strong.label[start];
const plazaVertices = vertices.filter(i => strong.label[i] === plazaComponent);

function bounds(indices) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const i of indices) {
    w = Math.min(w, graph.lng[i]); s = Math.min(s, graph.lat[i]);
    e = Math.max(e, graph.lng[i]); n = Math.max(n, graph.lat[i]);
  }
  return [w, s, e, n];
}

function distribution({ sizes }) {
  const counts = new Map();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => b - a);
}

console.log(JSON.stringify({
  snapshot: snapshot.osm3s?.timestamp_osm_base ?? snapshot.replicationTimestamp,
  vertices: vertices.length,
  usableVertices: usable.length,
  directedEdges: graph.adj.reduce((total, edges) => total + edges.length, 0),
  boundsWSEN: bounds(usable),
  weak: { count: weak.sizes.length, sizeFrequency: distribution(weak) },
  strong: { count: strong.sizes.length, sizeFrequency: distribution(strong) },
  plaza: { weakSize: weak.sizes[weak.label[start]], strongSize: plazaVertices.length, strongBoundsWSEN: bounds(plazaVertices) }
}, null, 2));

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < xi + (xj - xi) * (y - yi) / (yj - yi)) inside = !inside;
  }
  return inside;
}

if (process.argv[2]) {
  const { features } = JSON.parse(readFileSync(process.argv[2]));
  const rows = [];
  const matched = new Set();
  for (const { geometry, properties } of features) {
    const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const polygons = parts.map(([outer, ...holes]) => {
      const x = outer.map(point => point[0]), y = outer.map(point => point[1]);
      return { outer, holes, west: Math.min(...x), south: Math.min(...y), east: Math.max(...x), north: Math.max(...y) };
    });
    let total = 0, roundTrip = 0;
    for (const i of usable) {
      const x = graph.lng[i], y = graph.lat[i];
      if (!polygons.some(({ outer, holes, west, south, east, north }) =>
        x >= west && x <= east && y >= south && y <= north && inRing([x, y], outer) &&
        !holes.some(ring => inRing([x, y], ring)))) continue;
      matched.add(i);
      total++;
      if (strong.label[i] === plazaComponent) roundTrip++;
    }
    if (total) rows.push({ municipality: properties.MUNICIPAL, province: properties.PROVINCE, vertices: total, roundTrip });
  }
  console.table(rows.sort((a, b) => a.province.localeCompare(b.province) || a.municipality.localeCompare(b.municipality)));
  console.log('Vertices outside the supplied polygons:', usable.length - matched.size);
}
