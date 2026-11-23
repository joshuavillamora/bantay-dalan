/* Depth-first: dives down one road as far as it can, then backs up. Finds a route, usually a winding one. */
import { tracePath } from './common.js';

export function* dfs(g, s, t, mode) {
  const n = g.lat.length, seenOnce = new Uint8Array(n), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const stack = [s]; seenOnce[s] = 1;
  while (stack.length) {
    const u = stack.pop();
    if (done[u]) continue;
    done[u] = 1;
    const found = [];
    if (u !== t) for (const [v] of g.adj[u]) {
      if (done[v]) continue;
      if (!seenOnce[v]) { seenOnce[v] = 1; found.push(v); }
      prev[v] = u; stack.push(v);
    }
    yield { u, p: prev[u], found, q: stack.length };
    if (u === t) return tracePath(prev, t);
  }
  return null;
}
