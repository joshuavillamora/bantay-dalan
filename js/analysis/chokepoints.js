/* Chokepoint finder (pure logic, no DOM).
   1. Route every pair of demand points (popular places) on the open road network.
   2. Split the routes into road links (stretches between intersections) and count how many trips use each link.
   3. Close each heavily used link in turn, re-route the trips that used it, and measure the damage:
        score = extra travel seconds over all affected trips + penalty for every trip that becomes impossible.
   4. Return the links with the highest score. */
import { shortestPath } from '../algorithms/solve.js';
import { reverseAdjacency, routeMetrics } from '../graph/road-graph.js';

const tick = () => new Promise(r => setTimeout(r, 0));

export async function findChokepoints(g, demand, { candidates = 40, topK = 8, penalty = 1800, onProgress = () => {} } = {}) {
  const n = g.lat.length, radj = reverseAdjacency(g), demandSet = new Set(demand.map(d => d.i));
  const neighbours = u => { const s = new Set(); for (const e of g.adj[u]) s.add(e[0]); for (const e of radj[u]) s.add(e[0]); return s.size; };
  const isJunction = u => neighbours(u) !== 2;          // dead ends and 3+ way intersections end a link

  // 1. base routes
  const trips = [];
  for (let a = 0; a < demand.length; a++) for (let b = a + 1; b < demand.length; b++) {
    const path = shortestPath(g, demand[a].i, demand[b].i);
    if (path && path.length > 1) trips.push({ path, time: routeMetrics(g, path).time });
    if (trips.length % 6 === 0) { onProgress('Routing trips', trips.length, 1); await tick(); }
  }

  // 2. links and how many trips use each
  const links = new Map();
  trips.forEach((trip, ti) => {
    let cur = [trip.path[0]];
    for (let k = 1; k < trip.path.length; k++) {
      cur.push(trip.path[k]);
      if (isJunction(trip.path[k]) || k === trip.path.length - 1) {
        const nodes = cur[0] <= cur[cur.length - 1] ? cur.slice() : cur.slice().reverse();
        const key = nodes.length === 2 ? nodes.join(':') : nodes[0] + ':' + nodes[1] + ':' + nodes[nodes.length - 1];
        if (!nodes.some(u => demandSet.has(u))) {          // access roads to a place are not network chokepoints
          let l = links.get(key); if (!l) links.set(key, l = { key, nodes, trips: new Set() });
          l.trips.add(ti);
        }
        cur = [trip.path[k]];
      }
    }
  });
  const used = [...links.values()].sort((x, y) => y.trips.size - x.trips.size).slice(0, candidates);

  // 3. close each candidate and measure the damage
  const scored = [];
  for (let c = 0; c < used.length; c++) {
    const link = used[c], touched = new Set(link.nodes), closedPairs = new Set();
    for (let k = 1; k < link.nodes.length; k++) { closedPairs.add(link.nodes[k-1] * n + link.nodes[k]); closedPairs.add(link.nodes[k] * n + link.nodes[k-1]); }
    const saved = [...touched].map(u => [u, g.adj[u]]);
    saved.forEach(([u, list]) => { g.adj[u] = list.filter(e => !closedPairs.has(u * n + e[0])); });   // close (restored below, before any await)
    let extra = 0, cut = 0, rerouted = 0;
    try {
      for (const ti of link.trips) {
        const t = trips[ti], path = shortestPath(g, t.path[0], t.path[t.path.length - 1]);
        if (!path) cut++; else { rerouted++; extra += Math.max(0, routeMetrics(g, path).time - t.time); }
      }
    } finally { saved.forEach(([u, list]) => { g.adj[u] = list; }); }
    scored.push({ link, extra, cut, rerouted, score: extra + penalty * cut });
    onProgress('Testing closures', c + 1, used.length); await tick();
  }

  // 4. rank, skipping repeats of the same corridor
  scored.sort((x, y) => y.score - x.score);
  const out = [], seen = [];
  for (const s of scored) {
    if (s.score <= 0) continue;
    const name = linkName(g, s.link.nodes), sig = [...s.link.trips].sort().join(',');
    if (seen.some(o => o.name === name && o.sig === sig)) continue;
    seen.push({ name, sig });
    out.push({
      name, key: s.link.key, nodes: s.link.nodes, keys: edgeKeys(s.link.nodes, n),
      coords: s.link.nodes.map(u => [g.lat[u], g.lng[u]]),
      used: s.link.trips.size, total: trips.length, rerouted: s.rerouted, cut: s.cut,
      avgExtra: s.rerouted ? s.extra / s.rerouted : 0, score: s.score
    });
    if (out.length >= topK) break;
  }
  return { chokepoints: out, trips: trips.length };
}

/* directed edge codes (u*n+v, both ways) for closing a link */
export function edgeKeys(nodes, n) {
  const keys = new Set();
  for (let k = 1; k < nodes.length; k++) { keys.add(nodes[k-1] * n + nodes[k]); keys.add(nodes[k] * n + nodes[k-1]); }
  return keys;
}

/* the most common road name along a link */
function linkName(g, nodes) {
  const count = {};
  for (let k = 1; k < nodes.length; k++) {
    const e = g.adj[nodes[k-1]].find(x => x[0] === nodes[k]) || g.adj[nodes[k]].find(x => x[0] === nodes[k-1]);
    const nm = e && g.ways ? g.ways[e[3]] : 'Road';
    count[nm] = (count[nm] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}
