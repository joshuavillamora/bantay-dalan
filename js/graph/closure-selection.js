/* Selection uses the modeled segments, with coordinates in [latitude, longitude] order. */
import { roadSegmentKeysIn } from './road-spatial.js';

const positionEpsilon = 1e-12;

function side(a, b, p) {
  const x = (b[1] - a[1]) * (p[0] - a[0]);
  const y = (b[0] - a[0]) * (p[1] - a[1]);
  return Math.abs(x - y) <= (Math.abs(x) + Math.abs(y)) * Number.EPSILON * 16 ? 0 : Math.sign(x - y);
}

function bounds(a, b) {
  return [Math.min(a[1], b[1]), Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[0], b[0])];
}

function overlaps([w, s, e, n], [left, bottom, right, top]) {
  return w <= right + positionEpsilon && e >= left - positionEpsilon &&
    s <= top + positionEpsilon && n >= bottom - positionEpsilon;
}

// The line's 4 px tolerance extends its tips along the stroke. Parallel roads are never buffered in.
function extendTip(a, b, pixel) {
  if (!pixel) return a;
  const dy = a[0] - b[0], dx = a[1] - b[1];
  const length = Math.hypot(dy / pixel[0], dx / pixel[1]);
  return length ? [a[0] + dy * 4 / length, a[1] + dx * 4 / length] : a;
}

function strokeEdges(points, area, pixel) {
  const edges = [];
  const count = area ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    let a = points[i], b = points[(i + 1) % points.length];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    if (!area && i === 0) a = extendTip(a, points[1], pixel);
    if (!area && i === count - 1) b = extendTip(b, points[i], pixel);
    edges.push({ a, b, box: bounds(a, b) });
  }
  return edges;
}

function indexStroke(edges, south, north) {
  const count = Math.min(64, Math.ceil(edges.length / 8));
  const span = north - south || 1;
  const bandAt = lat => Math.max(0, Math.min(count - 1, Math.floor((lat - south) / span * count)));
  const bands = Array.from({ length: count }, () => []);
  for (const edge of edges) {
    edge.firstBand = bandAt(edge.box[1] - positionEpsilon);
    const last = bandAt(edge.box[3] + positionEpsilon);
    for (let i = edge.firstBand; i <= last; i++) bands[i].push(edge);
  }
  return { bandAt, bands };
}

function selected(p, q, { bandAt, bands }, area) {
  const box = bounds(p, q);
  const first = bandAt(box[1] - positionEpsilon), last = bandAt(box[3] + positionEpsilon);
  let inside = false;
  for (let i = first; i <= last; i++) {
    for (const { a, b, box: edgeBox, firstBand } of bands[i]) {
      // Test each stroke edge once, including when a road spans multiple bands.
      if (i !== Math.max(first, firstBand)) continue;
      if (overlaps(box, edgeBox)) {
        const roadSides = side(a, b, p) * side(a, b, q);
        // A line must hit the road interior. An area also includes boundary touches.
        if ((area ? roadSides <= 0 : roadSides < 0) && side(p, q, a) * side(p, q, b) <= 0) return true;
      }
      if (area && (a[0] > p[0]) !== (b[0] > p[0]) &&
        p[1] < a[1] + (p[0] - a[0]) * (b[1] - a[1]) / (b[0] - a[0])) inside = !inside;
    }
  }
  return inside;
}

export function* selectRoads(graph, points, { area = false, pixel } = {}) {
  const keys = new Set(), segments = new Map();
  const edges = strokeEdges(points, area, pixel);
  if (edges.length < (area ? 3 : 1)) return { keys, segments };
  if (area && edges.every(({ b }) => side(edges[0].a, edges[0].b, b) === 0)) return { keys, segments };

  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const { box: [w, s, e, n] } of edges) {
    west = Math.min(west, w); south = Math.min(south, s);
    east = Math.max(east, e); north = Math.max(north, n);
  }
  const { lat, lng, adj } = graph, size = lat.length;
  const query = [west - positionEpsilon, south - positionEpsilon, east + positionEpsilon, north + positionEpsilon];
  const stroke = indexStroke(edges, south, north);
  for (const key of roadSegmentKeysIn(graph, query)) {
    const u = Math.floor(key / size), v = key % size;
    const from = [lat[u], lng[u]], to = [lat[v], lng[v]];
    if (selected(from, to, stroke, area)) {
      keys.add(key);
      if (adj[v].some(edge => edge[0] === u)) keys.add(v * size + u);
      segments.set(physicalKey(size, u, v), [from, to]);
    }
    yield;
  }
  return { keys, segments };
}

const physicalKey = (size, u, v) => Math.min(u, v) * size + Math.max(u, v);

// Separate physical segments for counts and visual layers, keyed without direction.
export function roadGeometry(graph, keys) {
  const { lat, lng } = graph, size = lat.length;
  const segments = new Map();
  for (const key of keys) {
    const u = Math.floor(key / size), v = key % size;
    const pair = physicalKey(size, u, v);
    if (!segments.has(pair)) segments.set(pair, [[lat[u], lng[u]], [lat[v], lng[v]]]);
  }
  return segments;
}
