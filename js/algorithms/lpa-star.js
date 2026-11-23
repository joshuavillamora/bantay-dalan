/* LPA* (Lifelong Planning A*): like A*, but it remembers its search so that, when a road closure changes,
   only the affected part is repaired instead of searching from scratch.
   The remembered search lives in this module: lpaSearch() creates it, lpaRepair() reuses it, lpaReset() forgets it. */
import { TwoKeyHeap } from '../core/two-key-heap.js';
import { reverseAdjacency } from '../graph/road-graph.js';
import { blockedEdges } from '../graph/closure-filter.js';
import { edgeCost, heuristic } from './common.js';

let saved = null;
export const lpaReset = () => { saved = null; };
export const lpaReady = () => !!saved && saved.ready;
export const lpaInfo = () => saved && { g: saved.g, s: saved.s, mode: saved.mode };

function createSearch(g, s, t, mode, closures) {
  const n = g.lat.length, radj = reverseAdjacency(g), h = heuristic(g, t, mode);
  const st = { g, s, t, mode, n, ready: false,
    G: new Float64Array(n).fill(Infinity), rhs: new Float64Array(n).fill(Infinity),
    stamp: new Int32Array(n), inQ: new Uint8Array(n), heap: new TwoKeyHeap(), blocked: blockedEdges(g, closures) };
  const k2 = v => Math.min(st.G[v], st.rhs[v]), k1 = v => k2(v) + h(v);
  const bestPred = v => {   // cheapest way to arrive at v through an open road
    let best = Infinity, bp = -1;
    for (const [p, d, sp] of radj[v]) {
      if (st.blocked.has(p * n + v)) continue;
      const c = st.G[p] + edgeCost(mode, d, sp);
      if (c < best) { best = c; bp = p; }
    }
    return [best, bp];
  };
  st.update = v => {   // UpdateVertex; returns true if v just became reachable
    let fresh = false;
    if (v !== s) { const best = bestPred(v)[0]; if (st.rhs[v] === Infinity && best < Infinity) fresh = true; st.rhs[v] = best; }
    st.stamp[v]++; st.inQ[v] = 0;
    if (st.G[v] !== st.rhs[v]) { st.inQ[v] = 1; st.heap.push(v, k1(v), k2(v), st.stamp[v]); }
    return fresh;
  };
  const top = () => {
    const q = st.heap;
    while (q.size && (q.s[0] !== st.stamp[q.v[0]] || !st.inQ[q.v[0]])) q.pop();
    return q.size ? [q.a[0], q.b[0]] : [Infinity, Infinity];
  };
  st.path = () => {
    if (st.G[t] === Infinity) return null;
    const path = [t]; let v = t, guard = 0;
    while (v !== s && guard++ < n) { const bp = bestPred(v)[1]; if (bp < 0) return null; path.push(bp); v = bp; }
    return v === s ? path.reverse() : null;
  };
  st.compute = function* () {   // ComputeShortestPath: one yield per expanded node
    for (;;) {
      const [a, b] = top(), less = a < k1(t) || (a === k1(t) && b < k2(t));
      if (!(less || st.rhs[t] !== st.G[t]) || !st.heap.size) break;
      const u = st.heap.pop(); st.inQ[u] = 0; const found = []; let p = -1;
      if (st.G[u] > st.rhs[u]) {
        st.G[u] = st.rhs[u]; p = bestPred(u)[1];
        for (const e of g.adj[u]) if (st.update(e[0])) found.push(e[0]);
      } else {
        st.G[u] = Infinity; st.update(u);
        for (const e of g.adj[u]) st.update(e[0]);
      }
      yield { u, p, found, q: st.heap.size };
    }
    st.ready = true; return st.path();
  };
  return st;
}

/* first search: builds and remembers the search state */
export function* lpaSearch(g, s, t, mode, closures) {
  saved = createSearch(g, s, t, mode, closures);
  saved.rhs[s] = 0; saved.update(s);
  return yield* saved.compute();
}

/* closures changed: update only the affected nodes, return a generator that repairs the route */
export function lpaRepair(closures) {
  const st = saved, n = st.n, now = blockedEdges(st.g, closures), touched = new Set();
  for (const k of st.blocked) if (!now.has(k)) touched.add(k % n);   // road reopened
  for (const k of now) if (!st.blocked.has(k)) touched.add(k % n);   // road newly closed
  st.blocked = now; touched.forEach(v => st.update(v));
  return st.compute();
}
