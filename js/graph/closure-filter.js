/* Applies road closures (lines drawn on the map) to a graph. A road is closed when it crosses a closure line. */
import { crosses } from '../utils/geo.js';

/* A closure is either a line drawn on the map { a, b } or a whole road link { keys } (Set of u*n+v, from the chokepoint finder). */
const isClosed = (g, u, v, closures) => {
  const n = g.lat.length;
  let p = null, q = null;
  return closures.some(c => {
    if (c.keys) return c.keys.has(u * n + v);
    if (!p) { p = [g.lat[u], g.lng[u]]; q = [g.lat[v], g.lng[v]]; }
    return crosses(p, q, c.a, c.b);
  });
};

/* a new graph with the closed roads removed (the original is not modified) */
export function removeClosedRoads(g, closures) {
  if (!closures.length) return g;
  return { lat: g.lat, lng: g.lng, ways: g.ways, adj: g.adj.map((list, u) => list.filter(e => !isClosed(g, u, e[0], closures))) };
}

/* Set of closed directed roads encoded as u*n+v (used by LPA*, which keeps the graph and tracks closures itself) */
export function blockedEdges(g, closures) {
  const n = g.lat.length, set = new Set();
  if (!closures.length) return set;
  g.adj.forEach((list, u) => { for (const e of list) if (isClosed(g, u, e[0], closures)) set.add(u * n + e[0]); });
  return set;
}
