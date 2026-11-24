/* Applies road closures (lines drawn on the map) to a graph. A road is closed when it crosses a closure line. */
import { crosses } from '../utils/geo.js';
import { visitRoadSegments } from './road-spatial.js';

/* a new graph with the closed roads removed (the original is not modified) */
export function removeClosedRoads(g, closures) {
  if (!closures.length) return g;
  const closed = blockedEdges(g, closures), n = g.lat.length;
  if (!closed.size) return g;
  const adj = g.adj.slice();
  const touched = new Set(Array.from(closed, key => Math.floor(key / n)));
  for (const u of touched) adj[u] = g.adj[u].filter(([v]) => !closed.has(u * n + v));
  return { lat: g.lat, lng: g.lng, ways: g.ways, adj };
}

/* Set of closed directed roads encoded as u*n+v (used by LPA*, which keeps the graph and tracks closures itself) */
export function blockedEdges(g, closures) {
  const n = g.lat.length, set = new Set();
  for (const closure of closures) {
    if (closure.keys) {
      for (const key of closure.keys) {
        const u = Math.floor(key / n), v = key % n;
        if (g.adj[u]?.some(edge => edge[0] === v)) set.add(key);
      }
      continue;
    }
    const { a, b } = closure;
    visitRoadSegments(g, [Math.min(a[1], b[1]), Math.min(a[0], b[0]),
      Math.max(a[1], b[1]), Math.max(a[0], b[0])], (u, v) => {
      const start = Math.min(u, v), end = Math.max(u, v);
      if (!crosses([g.lat[start], g.lng[start]], [g.lat[end], g.lng[end]], a, b)) return;
      set.add(u * n + v);
      if (g.adj[v].some(edge => edge[0] === u)) set.add(v * n + u);
    });
  }
  return set;
}
