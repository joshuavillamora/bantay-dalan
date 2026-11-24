/* Shared engine for Dijkstra and A*: expand the node with the lowest priority. */
import { Heap } from '../core/heap.js';
import { edgeCost, heuristic, tracePath } from './common.js';

export const bestFirstWorkspace = n => ({
  cost: new Float64Array(n).fill(Infinity), prev: new Int32Array(n).fill(-1), done: new Uint8Array(n), touched: []
});

export function* bestFirst(g, s, t, mode, useHeuristic = false, workspace) {
  const { cost, prev, done } = workspace || bestFirstWorkspace(g.lat.length);
  const touched = workspace?.touched;
  if (touched) {
    // Analysis reuses these arrays across trips. Only nodes reached by the previous search need resetting.
    for (const v of touched) { cost[v] = Infinity; prev[v] = -1; done[v] = 0; }
    touched.length = 0;
    touched.push(s);
  }
  const heap = new Heap(), estimate = useHeuristic ? heuristic(g, t, mode) : () => 0;
  cost[s] = 0; heap.push(s, 0);
  while (heap.size) {
    const u = heap.pop();
    // A cheaper entry may already have settled this node since this entry was queued.
    if (done[u]) continue;
    done[u] = 1;
    const found = [];
    if (u !== t) for (const [v, d, sp] of g.adj[u]) {
      if (done[v]) continue;
      const nc = cost[u] + edgeCost(mode, d, sp);
      if (nc < cost[v]) {
        if (cost[v] === Infinity) { found.push(v); touched?.push(v); }
        cost[v] = nc; prev[v] = u; heap.push(v, nc + estimate(v));
      }
    }
    yield { u, p: prev[u], found, q: heap.size };
    if (u === t) return tracePath(prev, t);
  }
  return null;
}
