/* Decode a road dataset into a directed adjacency list.
   Graph shape: { lat[], lng[], adj[][], ways[] } where adj[u] = [[v, metres, km/h, wayIndex], ...] (directed edges)
   and ways[wayIndex] is the road's name. */
import { ROADS_URL, SPEED, DEFAULT_ROAD_SPEED, ROUTE_SNAP_LIMIT_METRES, ROUTE_ROAD_PROXIMITY_METRES } from '../config.js';
import { hav } from '../utils/geo.js';
import { prepareRoadSpatialIndex, roadSpatialIndex, visitRoadSegments } from './road-spatial.js';
import { finishWork, runInSlices } from '../utils/work-slices.js';

let graph = null, pending = null;
const reverseJobs = new WeakMap();

/* Directed edge weight in seconds or metres. */
export const edgeCost = (mode, distance, speed) => mode === 'fast' ? distance / (speed / 3.6) : distance;

/* Parallel edges between the same coordinates have the same length. Keeping
   the faster one gives the vertex path an unambiguous weight in both modes. */
function putEdge(edges, used, to, distance, speed, way) {
  for (let i = 0; i < used; i++) {
    if (edges[i][0] !== to) continue;
    if (edges[i][2] < speed) edges[i] = [to, distance, speed, way];
    return used;
  }
  edges[used] = [to, distance, speed, way];
  return used + 1;
}

export async function loadGraph() {
  if (graph) return graph;
  if (!pending) pending = fetchRoadGraph(ROADS_URL).then(built => graph ??= built).finally(() => { pending = null; });
  return pending;
}

export function setLoadedGraph(built) { graph = built; }

export async function fetchRoadGraph(url, { dataset, signal, onProgress = () => {} } = {}) {
  const check = () => signal?.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(url + ' not found (' + response.status + ')');
  let body = response.body;
  const timings = {};
  let start = performance.now();
  if (dataset) {
    // Validate the compressed bytes against the manifest before decoding the graph.
    const bytes = new Uint8Array(dataset.bytes);
    const reader = body.getReader();
    let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > bytes.length) throw new Error('Road dataset exceeds its published size');
        bytes.set(value, offset);
        offset += value.length;
        onProgress('Downloading roads', Math.floor(offset * 100 / bytes.length));
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    timings.download = performance.now() - start;
    check();
    if (offset !== bytes.length) throw new Error('Incomplete road dataset');
    onProgress('Verifying dataset');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const actual = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== dataset.sha256) throw new Error('Road dataset checksum mismatch');
    body = new Blob([bytes]).stream();
  }
  check();
  start = performance.now();
  onProgress('Reading road data');
  const data = url.endsWith('.gz')
    ? await new Response(body.pipeThrough(new DecompressionStream('gzip'))).json()
    : await response.json();
  timings.parse = performance.now() - start;
  check();
  if (dataset && (data.format !== 'bantay-roads-v1' || data.coordinates?.length !== dataset.vertices * 2 ||
    (dataset.scope && (data.scope !== dataset.scope || data.pbfSha256 !== dataset.source || data.replicationTimestamp !== dataset.version)))) {
    throw new Error('Road dataset metadata mismatch');
  }
  onProgress('Building directed graph');
  start = performance.now();
  const work = { stride: 1, keepGoing: () => !signal?.aborted };
  const decoded = await runInSlices(decodeSteps(data), work);
  check();
  const built = decoded.value;
  timings.build = performance.now() - start;
  if (dataset && built.edgeCount !== dataset.edges) throw new Error('Road dataset edge count mismatch');
  onProgress('Indexing roads');
  start = performance.now();
  await prepareRoadSpatialIndex(built, work.keepGoing);
  check();
  timings.spatial = performance.now() - start;
  if (dataset && roadSpatialIndex(built).bounds.some((value, i) => value !== dataset.bounds[i])) {
    throw new Error('Road dataset extent mismatch');
  }
  built.loadTimings = timings;
  return built;
}

export function buildGraph(elements) {
  const idx = new Map(), lat = [], lng = [], adj = [], ways = [];
  const node = (id, la, lo) => { let i = idx.get(id); if (i === undefined) { i = lat.length; idx.set(id, i); lat.push(la); lng.push(lo); adj.push([]); } return i; };
  for (const w of elements) {
    if (w.type !== 'way' || !w.geometry) continue;
    const t = w.tags || {}, sp = SPEED[t.highway] || DEFAULT_ROAD_SPEED;
    const oneway = t.oneway === '-1' ? -1 : (['yes','true','1'].includes(t.oneway) || t.junction === 'roundabout') ? 1 : 0;
    const wi = ways.push(t.name || t.ref || ('Unnamed ' + String(t.highway || 'road').replace(/_/g, ' '))) - 1;
    let prev = -1;
    for (let k = 0; k < w.nodes.length; k++) {
      const p = w.geometry[k]; if (!p) { prev = -1; continue; }
      const c = node(w.nodes[k], p.lat, p.lon);
      if (prev >= 0 && prev !== c) {
        const d = Math.max(0.01, hav(lat[prev], lng[prev], lat[c], lng[c]));
        if (oneway >= 0) putEdge(adj[prev], adj[prev].length, c, d, sp, wi);
        if (oneway <= 0) putEdge(adj[c], adj[c].length, prev, d, sp, wi);
      }
      prev = c;
    }
  }
  return { lat, lng, adj, ways };
}

export function decodeRoadGraph(data) {
  return finishWork(decodeSteps(data));
}

function* decodeSteps(data) {
  if (data.elements) return buildGraph(data.elements);
  if (data.format !== 'bantay-roads-v1' || data.coordinates.length < 4 || data.coordinates.length % 2) {
    throw new Error('Invalid local road dataset');
  }
  const { coordinates, classes, names } = data;
  const lat = [], lng = [], ways = [];
  for (let i = 0; i < coordinates.length; i += 2) {
    lat.push(coordinates[i] / 1e7);
    lng.push(coordinates[i + 1] / 1e7);
    if (i % 32768 === 32766) yield;
  }
  const size = lat.length, degrees = new Uint32Array(size);
  let processed = 0;
  // Count each direction before allocating rows so large graphs can fill the arrays directly.
  for (const [, directions, , nodes] of data.ways) {
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i - 1] === nodes[i]) continue;
      if (directions & 1) degrees[nodes[i - 1]]++;
      if (directions & 2) degrees[nodes[i]]++;
    }
    if (++processed % 512 === 0) yield;
  }
  const adj = new Array(size);
  for (let i = 0; i < size; i++) {
    adj[i] = new Array(degrees[i]);
    if (i % 16384 === 16383) yield;
  }
  const used = new Uint32Array(size);
  for (const [roadClass, directions, name, nodes] of data.ways) {
    const kind = classes[roadClass];
    const speed = SPEED[kind] || DEFAULT_ROAD_SPEED;
    const way = ways.push(names[name] || 'Unnamed ' + kind.replaceAll('_', ' ')) - 1;
    for (let i = 1; i < nodes.length; i++) {
      const u = nodes[i - 1], v = nodes[i];
      if (u === v) continue;
      // Keep distinct OSM nodes at identical coordinates without creating zero-cost cycles.
      const distance = Math.max(0.01, hav(lat[u], lng[u], lat[v], lng[v]));
      if (!Number.isFinite(distance)) throw new Error('Invalid modeled road segment');
      if (directions & 1) used[u] = putEdge(adj[u], used[u], v, distance, speed, way);
      if (directions & 2) used[v] = putEdge(adj[v], used[v], u, distance, speed, way);
    }
    if (++processed % 512 === 0) yield;
  }
  let edgeCount = 0;
  for (let i = 0; i < size; i++) {
    adj[i].length = used[i];
    edgeCount += used[i];
  }
  return { lat, lng, adj, ways, edgeCount };
}

/* index of the closest road node to [lat, lng] */
export function nearestNode(g, p, incoming) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.lat.length; i++) {
    if (!g.adj[i].length && !incoming?.[i]?.length) continue;
    const d = hav(p[0], p[1], g.lat[i], g.lng[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: bd };
}

/* Match nearestNode's outgoing-edge rule for nearby CHOKEPOINT demand points.
   The base graph indexes all vertices that can still be eligible after closures. */
export function nearestRoadVertex(g, point, base = g) {
  const [lat, lng] = point, radius = 250;
  const dy = radius / 110000, dx = dy / Math.cos(lat * Math.PI / 180);
  let best = { i: -1, d: Infinity };
  visitRoadSegments(base, [lng - dx, lat - dy, lng + dx, lat + dy], (a, b) => {
    for (const i of [a, b]) {
      if (!g.adj[i].length) continue;
      const d = hav(lat, lng, g.lat[i], g.lng[i]);
      if (d < best.d || d === best.d && i < best.i) best = { i, d };
    }
  });
  return best.d <= radius ? best : nearestNode(g, point);
}

/* Keep the selected pin and the modeled routing vertex separate. */
export function snapRoutePoint(g, point) {
  const noRoad = { i: -1, d: Infinity, reason: 'noRoad' };
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return noRoad;
  const [lat, lng] = point;
  const scale = Math.cos(lat * Math.PI / 180);
  const latMargin = ROUTE_ROAD_PROXIMITY_METRES / 110000, lngMargin = latMargin / scale;
  const box = [lng - lngMargin, lat - latMargin, lng + lngMargin, lat + latMargin];
  const [w, s, e, n] = roadSpatialIndex(g).bounds;
  if (box[2] < w || box[3] < s || box[0] > e || box[1] > n) return { ...noRoad, reason: 'outside' };

  let best = noRoad, roadDistance = ROUTE_ROAD_PROXIMITY_METRES;
  // Pick the closest modeled segment, then use its nearest eligible vertex for routing.
  visitRoadSegments(g, box, (u, v) => {
    const x = (g.lng[u] - lng) * scale, y = g.lat[u] - lat;
    const dx = (g.lng[v] - g.lng[u]) * scale, dy = g.lat[v] - g.lat[u];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0;
    const offset = hav(lat, lng, g.lat[u] + t * dy, g.lng[u] + t * (g.lng[v] - g.lng[u]));
    if (offset > roadDistance) return;
    const a = hav(lat, lng, g.lat[u], g.lng[u]), b = hav(lat, lng, g.lat[v], g.lng[v]);
    const i = a < b ? u : b < a ? v : Math.min(u, v);
    const d = Math.min(a, b);
    if (d > ROUTE_SNAP_LIMIT_METRES || (offset === roadDistance && best.i >= 0 && (d > best.d || d === best.d && i >= best.i))) return;
    roadDistance = offset;
    best = { i, d };
  });
  return best;
}

export function snapRouteEndpoints(g, start, end) {
  return { s: snapRoutePoint(g, start).i, t: snapRoutePoint(g, end).i };
}

/* Incoming-edge ranges reference the existing forward rows, including their costs. */
export function reverseAdjacency(g) {
  return g.radj || finishWork(reverseSteps(g));
}

export async function prepareReverseAdjacency(g) {
  if (g.radj) return;
  if (!reverseJobs.has(g)) {
    const job = runInSlices(reverseSteps(g), { stride: 1 }).finally(() => reverseJobs.delete(g));
    reverseJobs.set(g, job);
  }
  await reverseJobs.get(g);
}

function* reverseSteps(g) {
  const offsets = new Uint32Array(g.adj.length + 1);
  for (let u = 0; u < g.adj.length; u++) {
    for (const [v] of g.adj[u]) offsets[v + 1]++;
    if (u % 8192 === 8191) yield;
  }
  for (let i = 1; i < offsets.length; i++) offsets[i] += offsets[i - 1];
  const vertices = new Uint32Array(offsets.at(-1)), indices = new Uint32Array(vertices.length);
  const write = offsets.slice(0, -1);
  for (let u = 0; u < g.adj.length; u++) {
    const list = g.adj[u];
    for (let i = 0; i < list.length; i++) {
      const offset = write[list[i][0]]++;
      vertices[offset] = u; indices[offset] = i;
    }
    if (u % 8192 === 8191) yield;
  }
  return g.radj ??= { offsets, vertices, indices };
}

/* total distance (m) and travel time (s) of a path */
export function routeMetrics(g, path, closed) {
  if (!path.length || !g.adj[path[0]]) throw new Error('Invalid route start');
  let dist = 0, time = 0;
  for (let k = 1; k < path.length; k++) {
    const u = path[k - 1], v = path[k];
    const e = g.adj[u].find(x => x[0] === v);
    if (!e || closed?.has(u * g.lat.length + v)) throw new Error('Route contains an unavailable directed edge');
    dist += edgeCost('short', e[1], e[2]);
    time += edgeCost('fast', e[1], e[2]);
  }
  return { dist, time };
}
