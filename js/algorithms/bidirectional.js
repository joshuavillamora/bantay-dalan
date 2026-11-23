/* Bidirectional Dijkstra: forward search from the start and backward search from the goal (over reversed roads).
   Stops when the cheapest frontiers add up to at least the best route found, so the result equals Dijkstra's. */
import { Heap } from '../core/heap.js';
import { reverseAdjacency } from '../graph/road-graph.js';
import { edgeCost } from './common.js';

export function* bidirectional(g, s, t, mode) {
  if (s === t) return [s];
  const n = g.lat.length, adjs = [g.adj, reverseAdjacency(g)];
  const dist = [new Float64Array(n).fill(Infinity), new Float64Array(n).fill(Infinity)];
  const prev = [new Int32Array(n).fill(-1), new Int32Array(n).fill(-1)];
  const done = [new Uint8Array(n), new Uint8Array(n)], heap = [new Heap(), new Heap()];
  dist[0][s] = 0; dist[1][t] = 0; heap[0].push(s, 0); heap[1].push(t, 0);
  const top = k => { const h = heap[k]; while (h.size && done[k][h.v[0]]) h.pop(); return h.size ? h.k[0] : Infinity; };
  let mu = Infinity, meet = -1;
  for (;;) {
    const tf = top(0), tb = top(1);
    if (tf === Infinity || tb === Infinity || tf + tb >= mu) break;
    const k = tf <= tb ? 0 : 1, o = 1 - k, u = heap[k].pop();
    done[k][u] = 1;
    if (dist[o][u] < Infinity && dist[k][u] + dist[o][u] < mu) { mu = dist[k][u] + dist[o][u]; meet = u; }
    const found = [];
    for (const [v, d, sp] of adjs[k][u]) {
      if (done[k][v]) continue;
      const nc = dist[k][u] + edgeCost(mode, d, sp);
      if (nc < dist[k][v]) { if (dist[k][v] === Infinity) found.push(v); dist[k][v] = nc; prev[k][v] = u; heap[k].push(v, nc); }
      if (dist[o][v] < Infinity && dist[k][v] + dist[o][v] < mu) { mu = dist[k][v] + dist[o][v]; meet = v; }
    }
    yield { u, p: prev[k][u], found, q: heap[0].size + heap[1].size };
  }
  if (meet < 0) return null;
  const path = [];
  for (let v = meet; v >= 0; v = prev[0][v]) path.push(v);
  path.reverse();
  for (let v = prev[1][meet]; v >= 0; v = prev[1][v]) path.push(v);
  return path;
}
