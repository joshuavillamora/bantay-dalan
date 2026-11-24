/* Helpers shared by the search algorithms.
   Every search generator takes (graph, startNode, goalNode, mode).
   LPA* also accepts active closures for incremental repair.
   - yields { u, p, found, q } for each processed search event (so the UI can animate it)
   - returns the path as an array of node indices, or null if there is no route. */
import { chordDistance } from '../utils/geo.js';
import { MAX_SPEED_MS } from '../config.js';

export { edgeCost } from '../graph/road-graph.js';

/* straight-line estimate from node v to the goal, in the same unit as edgeCost */
export const heuristic = (g, goal, mode) => v =>
  chordDistance(g.lat[v], g.lng[v], g.lat[goal], g.lng[goal]) / (mode === 'fast' ? MAX_SPEED_MS : 1);

/* follow prev[] pointers back from the goal */
export function tracePath(prev, goal) {
  const path = [];
  for (let v = goal; v >= 0; v = prev[v]) path.push(v);
  return path.reverse();
}
