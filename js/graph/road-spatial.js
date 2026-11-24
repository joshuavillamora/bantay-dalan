/* Index physical road segments in a small degree grid for snapping and the local map. */
import { finishWork, runInSlices } from '../utils/work-slices.js';

const cell = degrees => Math.floor(degrees * 50);
const key = (x, y) => x * 10000 + y;

export function roadSpatialIndex(graph) {
  return graph.roadIndex || finishWork(indexSteps(graph));
}

export async function prepareRoadSpatialIndex(graph) {
  if (!graph.roadIndex) await runInSlices(indexSteps(graph), { stride: 1 });
}

function* indexSteps(graph) {
  const { lat, lng, adj } = graph, size = lat.length;
  const bins = new Map();
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (let u = 0; u < size; u++) {
    for (const [v] of adj[u]) {
      if (u > v && adj[v].some(edge => edge[0] === u)) continue;
      const w = Math.min(lng[u], lng[v]), e = Math.max(lng[u], lng[v]);
      const s = Math.min(lat[u], lat[v]), n = Math.max(lat[u], lat[v]);
      bounds[0] = Math.min(bounds[0], w);
      bounds[1] = Math.min(bounds[1], s);
      bounds[2] = Math.max(bounds[2], e);
      bounds[3] = Math.max(bounds[3], n);
      const segment = u * size + v;
      for (let x = cell(w); x <= cell(e); x++) {
        for (let y = cell(s); y <= cell(n); y++) {
          const k = key(x, y);
          if (!bins.has(k)) bins.set(k, []);
          bins.get(k).push(segment);
        }
      }
    }
    if (u % 4096 === 4095) yield;
  }
  return graph.roadIndex = { bounds, bins };
}

export function visitRoadSegments(graph, [w, s, e, n], visit) {
  const { bounds, bins } = roadSpatialIndex(graph);
  const west = cell(Math.max(bounds[0], w)), east = cell(Math.min(bounds[2], e));
  const south = cell(Math.max(bounds[1], s)), north = cell(Math.min(bounds[3], n));
  const { lat, lng, adj } = graph, size = lat.length;
  for (let x = west; x <= east; x++) {
    for (let y = south; y <= north; y++) {
      const segments = bins.get(key(x, y));
      if (!segments) continue;
      for (const segment of segments) {
        const u = Math.floor(segment / size), v = segment % size;
        const left = Math.min(lng[u], lng[v]), bottom = Math.min(lat[u], lat[v]);
        // Visit a segment once, in its first cell inside the query.
        if (x !== Math.max(west, cell(left)) || y !== Math.max(south, cell(bottom))) continue;
        if (left > e || Math.max(lng[u], lng[v]) < w || bottom > n || Math.max(lat[u], lat[v]) < s) continue;
        visit(u, v, adj[u].find(edge => edge[0] === v)[2]);
      }
    }
  }
}
