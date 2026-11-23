/* The road network: loads the roads JSON once and builds an adjacency-list graph.
   Graph shape: { lat[], lng[], adj[][] } where adj[u] = [[v, metres, km/h], ...] (directed edges). */
import { ROADS_URL, SPEED, DEFAULT_ROAD_SPEED } from '../config.js';
import { hav } from '../utils/geo.js';

let graph = null, pending = null;

export async function loadGraph() {
  if (graph) return graph;
  if (!pending) pending = (async () => {
    const r = await fetch(ROADS_URL);
    if (!r.ok) throw new Error(ROADS_URL + ' not found (' + r.status + ')');
    graph = buildGraph((await r.json()).elements);
    return graph;
  })();
  try { return await pending; } catch (e) { pending = null; throw e; }
}

export function buildGraph(elements) {
  const idx = new Map(), lat = [], lng = [], adj = [];
  const node = (id, la, lo) => { let i = idx.get(id); if (i === undefined) { i = lat.length; idx.set(id, i); lat.push(la); lng.push(lo); adj.push([]); } return i; };
  for (const w of elements) {
    if (w.type !== 'way' || !w.geometry) continue;
    const t = w.tags || {}, sp = SPEED[t.highway] || DEFAULT_ROAD_SPEED;
    const oneway = t.oneway === '-1' ? -1 : (['yes','true','1'].includes(t.oneway) || t.junction === 'roundabout') ? 1 : 0;
    let prev = -1;
    for (let k = 0; k < w.nodes.length; k++) {
      const p = w.geometry[k]; if (!p) { prev = -1; continue; }
      const c = node(w.nodes[k], p.lat, p.lon);
      if (prev >= 0) {
        const d = hav(lat[prev], lng[prev], lat[c], lng[c]);
        if (oneway >= 0) adj[prev].push([c, d, sp]);
        if (oneway <= 0) adj[c].push([prev, d, sp]);
      }
      prev = c;
    }
  }
  return { lat, lng, adj };
}

/* index of the closest road node to [lat, lng] */
export function nearestNode(g, p) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.lat.length; i++) {
    if (!g.adj[i].length) continue;
    const d = hav(p[0], p[1], g.lat[i], g.lng[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: bd };
}

/* reversed copy of the roads (who can reach me?), cached on the graph */
export function reverseAdjacency(g) {
  if (g.radj) return g.radj;
  const r = g.adj.map(() => []);
  g.adj.forEach((list, u) => list.forEach(([v, d, sp]) => r[v].push([u, d, sp])));
  return g.radj = r;
}

/* total distance (m) and travel time (s) of a path */
export function routeMetrics(g, path) {
  let dist = 0, time = 0;
  for (let k = 1; k < path.length; k++) {
    const e = g.adj[path[k-1]].find(x => x[0] === path[k]);
    if (e) { dist += e[1]; time += e[1] / (e[2] / 3.6); }
  }
  return { dist, time };
}
