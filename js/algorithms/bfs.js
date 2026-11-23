/* Breadth-first: explores ring by ring, ignoring distance. Finds the fewest road segments. */
import { edgeCost, tracePath } from './common.js';

export function* bfs(g, s, t, mode) {
  const n = g.lat.length, prev = new Int32Array(n).fill(-1), done = new Uint8Array(n), seen = new Uint8Array(n);
  const queue = [s]; let head = 0; seen[s] = 1;
  while (head < queue.length) {
    const u = queue[head++];
    if (done[u]) continue;
    done[u] = 1;
    const found = [];
    if (u !== t) for (const [v] of g.adj[u]) {
      if (done[v] || seen[v]) continue;
      seen[v] = 1; prev[v] = u; queue.push(v); found.push(v);
    }
    yield { u, p: prev[u], found, q: queue.length - head };
    if (u === t) return tracePath(prev, t);
  }
  return null;
}
