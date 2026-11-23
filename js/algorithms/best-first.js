/* Shared engine for Dijkstra, A* and Greedy best-first: expand the node with the lowest priority.
   priority(costSoFar, estimateToGoal) decides the flavour. greedy=true freezes a node's cost the first time it is seen. */
import { Heap } from '../core/heap.js';
import { edgeCost, heuristic, tracePath } from './common.js';

export function* bestFirst(g, s, t, mode, { priority, greedy = false }) {
  const n = g.lat.length, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const heap = new Heap(), h = heuristic(g, t, mode);
  cost[s] = 0; heap.push(s, 0);
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    const found = [];
    if (u !== t) for (const [v, d, sp] of g.adj[u]) {
      if (done[v]) continue;
      const nc = cost[u] + edgeCost(mode, d, sp);
      if (nc < cost[v] && (!greedy || cost[v] === Infinity)) {
        if (cost[v] === Infinity) found.push(v);
        cost[v] = nc; prev[v] = u; heap.push(v, priority(nc, h(v)));
      }
    }
    yield { u, p: prev[u], found, q: heap.size };
    if (u === t) return tracePath(prev, t);
  }
  return null;
}
