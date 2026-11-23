/* Runs a search generator to completion and returns only the path (no animation). */
import { astar } from './astar.js';

export function shortestPath(g, s, t, mode = 'fast') {
  const it = astar(g, s, t, mode);
  let r; while (!(r = it.next()).done);
  return r.value;
}
